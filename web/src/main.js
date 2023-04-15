import { log } from "./log.js";
import { initConfig, resetConfig, saveConfig, updateSettingsInUI } from "./config.js";
import { resetGrid, getGridDict, generateGrid, drawGrid } from "./grid.js";

/**
 * Global namespace, aliased to `window.ext`
 */
const ext = {
  config: {},
  history: {
    /** Only played note-on messages */
    playedNotes: [],
    /** All incoming MIDI input message */
    midiInput: {
      file: null,
      track: null,
      tick: 0,
      tickTimer: null,
    },
  },
  stats: {
    guideNoteTimings: [],
  },
}
window.ext = ext

//////////////////////////////////////////
// INIT                                 //
//////////////////////////////////////////

WebMidi.enable().then(init).catch(console.error);

// Function triggered when WEBMIDI.js is ready
async function init() {

  // Load Config
  ext.config = initConfig()

  // Setup MIDI callbacks / event listeners
  await registerUiEvents()
  await registerMidiEvents()

  // Setup Grid
  await setupGrid()

  // Put LinnStrument out of User Firmware Mode (if it still is)
  ext.output.sendNrpnValue(nrpn(245), nrpn(0), { channels: 1 });

  log.info(`Successfully initialized.`)

  // Infer current layout / transposition from LinnStrument directly
  await updateLayoutFromLinnStrument()
  
  // Periodically sync state between LinnStrument, app and player
  setInterval(() => {
    checkForStatisticsDump()
    checkForMidiDump()
    void updateLayoutFromLinnStrument()
  }, ext.config.updateStateInterval);

  createMidiInputRecording()
}

async function setupGrid() {
  resetGrid()
  ext.grid = generateGrid(ext.config.startNoteNumber, ext.config.rowOffset, ext.config.colOffset)
  ext.gridDict = getGridDict(ext.grid, ext.config.startNoteNumber)
  drawGrid(ext.grid)
}

/**
 * Register UI Events and Listeners
 */
async function registerUiEvents() {
  // UI Buttons Listeners
  document.getElementById("save").addEventListener("click", (event) => {
    saveConfig(ext.config, event)
  });
  document.getElementById("reset").addEventListener("click", resetConfig);
  document.getElementById("clear-log").addEventListener("click", clearLog);
  document.getElementById("calculate-statistics").addEventListener("click", calculateStatistics);

  // UI Resize trigger, with debounce
  window.addEventListener("resize", debounce(() => {
    drawGrid(ext.grid)
  }, 200));

  // Enable tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
  })
}

/**
 * Register listeners and callbacks to MIDI events / messages
 */
async function registerMidiEvents() {

  //////////////////////////////////////////
  // INSTRUMENT INPUT                     //
  //////////////////////////////////////////

  if (ext.config.instrumentInputPort) {
    try {
      log.info(`Connecting LinnStrument MIDI Input: ${ext.config.instrumentInputPort}`)
      ext.input = WebMidi.getInputByName(ext.config.instrumentInputPort)
      ext.input.addListener("noteon", (msg) => {
        const noteNumber = msg.dataBytes[0]
        ext.history.playedNotes.push({
          time: Date.now(),
          noteNumber: msg.note.number,
        })
        highlightVisualization(noteNumber, ext.config.playedHighlightColor)

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOn(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.history.midiInput.track.add(ext.history.midiInput.tick, jzzMsg);
      });
      ext.input.addListener("noteoff", (msg) => {
        highlightVisualization(msg.dataBytes[0], 0)

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOff(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.history.midiInput.track.add(ext.history.midiInput.tick, jzzMsg);
      });
      ext.input.addListener("controlchange", (msg) => {
        // Filter out the LinnStrument control (NRPN / RPN) messages
        const ignoredSubTypes = [
          "dataentrycoarse", "dataentryfine", 
          "registeredparametercoarse", "registeredparameterfine",
          "nonregisteredparametercoarse", "nonregisteredparameterfine",
        ]
        // Add it to MIDI input recording
        if (!ignoredSubTypes.includes(msg.subtype)) {
          console.log(msg.subtype, msg)
          const jzzMsg = JZZ.MIDI.control(msg.message.channel, msg.controller.number, msg.rawValue)
          ext.history.midiInput.track.add(ext.history.midiInput.tick, jzzMsg);
        }
      })

    } catch (err) {
      log.error(`Could not connect to Light Guide Input Port: ${ext.config.lightGuideInputPort}`)
      log.error(err.toString())
      console.error(err)
    }
  } else {
    log.error(`No Instrument Input Port given.`)
  }

  //////////////////////////////////////////
  // INSTRUMENT OUTPUT                    //
  //////////////////////////////////////////

  if (ext.config.instrumentOutputPort) {
    try {
      log.info(`Connecting LinnStrument MIDI Output: ${ext.config.instrumentOutputPort}`)
      ext.output = WebMidi.getOutputByName(ext.config.instrumentOutputPort)
    } catch (err) {
      log.error(`Could not open Instrument Output Port: ${ext.config.instrumentInputPort}`)
    }
  } else {
    log.warn(`No Instrument Output Port given. Without this, Light Guide highlighting will not work.`)
  }

  //////////////////////////////////////////
  // LIGHT GUIDE INPUT                    //
  //////////////////////////////////////////

  if (ext.config.lightGuideInputPort) {
    try {
      log.info(`Connecting Light Guide MIDI Input: ${ext.config.lightGuideInputPort}`)
      ext.lightGuideInput = WebMidi.getInputByName(ext.config.lightGuideInputPort)

      // Support "typical" Light Guide where noteon / noteoff MIDI events are used
      ext.lightGuideInput.addListener("noteon", async (msg) => {
        const noteNumber = msg.dataBytes[0]
        highlightInstrument(noteNumber, ext.config.guideHighlightColor)
        highlightVisualization(noteNumber, ext.config.guideHighlightColor, 'guide', true)

        if (ext.config.guideNoteStatistics) {
          const timing = await measureNoteTiming(noteNumber)
          logGuideNoteTiming(timing)
        }
      });
      ext.lightGuideInput.addListener("noteoff", (msg) => {
        const noteNumber = msg.dataBytes[0]
        highlightInstrument(noteNumber, 0)
        highlightVisualization(noteNumber, 0, 'guide')
      });

      // Support Synthesia Proprietary 1 (ONE Smart Piano) Light Guide input
      ext.lightGuideInput.addListener("keyaftertouch", async (msg) => {
        // Add note number offset for ONE Smart Piano 
        const noteNumber = msg.dataBytes[0] + 21

        if (msg.value > 0) {
          highlightInstrument(noteNumber, ext.config.guideHighlightColor)
          highlightVisualization(noteNumber, ext.config.guideHighlightColor, 'guide', true)
          if (ext.config.guideNoteStatistics) {
            const timing = await measureNoteTiming(noteNumber)
            logGuideNoteTiming(timing)
          }
        } else {
          highlightInstrument(noteNumber, 0)
          highlightVisualization(noteNumber, 0, 'guide')
        }
      });

    } catch (err) {
      log.error(`Could not connect to Light Guide Input Port: ${ext.config.lightGuideInputPort}`)
      log.error(err.toString())
      console.error(err)
    }
  } else {
    log.warn(`No Light Guide MIDI input. The Light Guide Feature will not work.`)
  }

  //////////////////////////////////////////
  // MIDI THRU FORWARDS                   //
  //////////////////////////////////////////

  if (ext.input) {
    if (ext.config.forwardPort1) {
      try {
        ext.forwardPort1 = WebMidi.getOutputByName(ext.config.forwardPort1)
        ext.input.addForwarder(ext.forwardPort1)
        log.info(`Connecting MIDI Forward Port 1: ${ext.config.forwardPort1}`)
      } catch (err) {
        log.warn(`Could not open optional Forward Port 1: ${ext.config.forwardPort1}`)
      }
    }
    if (ext.config.forwardPort2) {
      try {
        ext.forwardPort2 = WebMidi.getOutputByName(ext.config.forwardPort2)
        ext.input.addForwarder(ext.forwardPort2)
        log.info(`Connecting MIDI Forward Port 2: ${ext.config.forwardPort2}`)
      } catch (err) {
        log.warn(`Could not open optional Forward Port 2: ${ext.config.forwardPort2}`)
      }
    }
  } else {
    log.warn(`No Instrument input found, cannot forward MIDI from it.`)
  }

  return
}

//////////////////////////////////////////
// HELPER FUNCTIONS                     //
//////////////////////////////////////////

/**
 * Highlight pads on instrument by note number and color
 */
export function highlightInstrument(noteNumber, color) {
  const noteCoords = ext.gridDict[noteNumber]
  if (noteCoords) {
    for (const noteCoord of noteCoords) {
      highlightInstrumentXY(noteCoord[0], noteCoord[1], color)
    }
  }
}

/**
 * Highlight pads on instrument by x / y coordinates and color
 * 
 * Will only work if we have Instrument Output port
 */
export function highlightInstrumentXY(x, y, color) {
  if (ext.output) {
    const channel = ext.output.channels[1]
    channel.sendControlChange(20, x + 1); // Add one because 0 is settings
    channel.sendControlChange(21, y);
    channel.sendControlChange(22, color);
  }
}

/**
 * Highlight pads on web visualization by note number and color
 */
export function highlightVisualization(noteNumber, color, type = "played", big = false) {

  const noteCoords = ext.gridDict[noteNumber]
  if (noteCoords) {
    for (const noteCoord of noteCoords) {
      const x = noteCoord[0]
      const y = noteCoord[1]

      if (color === 0) {
        const cell = document.getElementById(`highlight-${type}-${x}-${y}`)
        if (cell) {
          cell.parentNode.removeChild(cell);
        }
      } else {
        const cell = document.getElementById(`cell-${x}-${y}`)
        const size = cell.offsetWidth

        const highlightEl = document.createElement('span')
        highlightEl.id = `highlight-${type}-${x}-${y}`
        highlightEl.className = `highlight highlight-${type} highlight-${color}`
        if (big) {
          highlightEl.style = `height: ${size - 6}px; width: ${size - 6}px; margin-left: ${3}px;`
        } else {
          highlightEl.style = `height: ${size / 2}px; width: ${size / 2}px; margin-left: ${size / 4}px;`
        }

        cell.prepend(highlightEl)
      }
    }
  }
}

async function updateLayoutFromLinnStrument() {

  // Split Left Octave (0: —5, 1: -4, 2: -3, 3: -2, 4: -1, 5: 0, 6: +1, 7: +2, 8: +3, 9: +4. 10: +5)
  const splitLeftOctave = await getLinnStrumentParamValue(36);
  // Split Left Transpose Pitch (0-6: -7 to -1, 7: 0, 8-14: +1 to +7)
  const splitLeftTranspose = await getLinnStrumentParamValue(37);
  // Global Row Offset (only supports, 0: No overlap, 3 4 5 6 7 12: Intervals, 13: Guitar, 127: 0 offset)
  let rowOffset = await getLinnStrumentParamValue(227);

  // Get current BPM
  ext.config.bpm = await getLinnStrumentParamValue(238);

  if (rowOffset === 0) {
    rowOffset = ext.config.linnStrumentSize / 8
  }

  let startNoteNumber = 30 + (-7 + splitLeftTranspose)
  startNoteNumber += (-5 + splitLeftOctave) * 12

  if (ext.config.rowOffset !== rowOffset || ext.config.startNoteNumber !== startNoteNumber) {
    ext.config.rowOffset = rowOffset
    ext.config.startNoteNumber = startNoteNumber
    setupGrid()
    updateSettingsInUI(ext.config)
    log.info(`Detected layout change in LinnStrument: startNoteNumber=${startNoteNumber} rowOffset=${rowOffset}`)
  }
}

async function getLinnStrumentParamValue(paramNumber) {
  return new Promise((resolve, reject) => {
    ext.output.sendNrpnValue(nrpn(299), nrpn(paramNumber), { channels: 1 });
    ext.input.channels[1].addListener("nrpn", (msg) => {
      // console.debug(`NRPN Return`, msg.message.data, msg)
      if (msg.message.dataBytes[0] === 38) {
        return resolve(msg.message.dataBytes[1])
      }
    }, { duration: 200 })
    setTimeout(() => {
      reject(new Error(`Timeout when getting NRPN value readout`))
    }, 300);
  });
}

/**
 * Measure how the guide note is actually played
 * 
 * TODO: This currently only checks if a played note is close in time to the guide note
 *       There is no detection of wrong played notes that have no guide note, yet
 */
async function measureNoteTiming(noteNumber) {
  return new Promise((resolve) => {
    let pastTimeOffset
    let futureTimeOffset
    let foundMatch = false
    const now = Date.now()

    const result = {
      noteNumber: noteNumber,
      noteIdentifier: new Note(noteNumber).identifier,
      time: now,
      timingOffset: Infinity,
    }

    // Detect notes played too early
    const earlyNote = ext.history.playedNotes.findLast((el) => {
      return el.noteNumber === noteNumber && el.time >= (now - ext.config.missedNoteThreshold)
    });
    if (earlyNote) {
      pastTimeOffset = earlyNote.time - now
      if (Math.abs(pastTimeOffset) <= ext.config.delayedNoteThreshold) {
        // If note is played within `delayedNoteThreshold`, consider it a match right away
        result.timingOffset = pastTimeOffset
        return resolve(result)
      } else if (Math.abs(pastTimeOffset) <= ext.config.missedNoteThreshold) {
        // If found within `missedNoteThreshold`, mark it as possible match
        // but keep looking into future for more precise match
        foundMatch = true
      }
    }

    // Detect notes played too late
    const timeOut = pastTimeOffset ? Math.abs(pastTimeOffset) : ext.config.missedNoteThreshold
    let poller;
    poller = setInterval(() => {
      const lateNote = ext.history.playedNotes.findLast((el) => {
        return el.time > now && el.noteNumber === noteNumber
      });
      if (lateNote) {
        clearInterval(poller)
        futureTimeOffset = lateNote.time - now
        console.log('Found in future', lateNote, futureTimeOffset)
        foundMatch = true

        if (!pastTimeOffset) {
          result.timingOffset = futureTimeOffset
        } else if (Math.abs(futureTimeOffset < Math.abs(pastTimeOffset))) {
          result.timingOffset = futureTimeOffset
        } else {
          result.timingOffset = pastTimeOffset
        }

        return resolve(result)

      }
    }, ext.config.delayedNoteThreshold / 4);

    setTimeout((timingOffset) => {
      clearInterval(poller);
      if (!foundMatch) {
        return resolve(result)
      } else {
        result.timingOffset = result.timingOffset || pastTimeOffset || 7777
        return resolve(result)
      }
    }, timeOut, result.timingOffset);
  });
}

/**
 * Logs and visualizes the Light Guide Note timing statistics
 */
function logGuideNoteTiming(entry) {
  ext.stats.guideNoteTimings.push(entry)

  if (Math.abs(entry.timingOffset) > ext.config.missedNoteThreshold) {
    log.info(`Guide Note ${entry.noteIdentifier} <span class="badge bg-danger">MISSED</span>`)
  } else if (Math.abs(entry.timingOffset) <= ext.config.delayedNoteThreshold) {
    if (entry.timingOffset < 0) {
      log.info(`Guide Note ${entry.noteIdentifier} <span class="badge bg-success">${entry.timingOffset}ms</span>`)
    } else {
      log.info(`Guide Note ${entry.noteIdentifier} <span class="badge bg-success">+${entry.timingOffset}ms</span>`)
    }
  } else if (entry.timingOffset < 0) {
    log.info(`Guide Note ${entry.noteIdentifier} <span class="badge bg-info">${entry.timingOffset}ms</span>`)
  } else {
    log.info(`Guide Note ${entry.noteIdentifier} <span class="badge bg-primary">+${entry.timingOffset}ms</span>`)
  }

  const pads = document.getElementsByClassName(`note-number-${entry.noteNumber}`)
  for (const pad of pads) {
    if (Math.abs(entry.timingOffset) > ext.config.missedNoteThreshold) {
      pad.classList.add("played-out-of-time");
      setTimeout(() => {
        pad.classList.remove("played-out-of-time");
      }, ext.config.guideNoteStaticsFadeOut)
    } else if (Math.abs(entry.timingOffset) <= ext.config.delayedNoteThreshold) {
      pad.classList.add("played-in-time");
      setTimeout(() => {
        pad.classList.remove("played-in-time");
      }, ext.config.guideNoteStaticsFadeOut)
    } else if (entry.timingOffset < 0) {
      pad.classList.add("played-early");
      setTimeout(() => {
        pad.classList.remove("played-early");
      }, ext.config.guideNoteStaticsFadeOut)
    } else {
      pad.classList.add("played-late");
      setTimeout(() => {
        pad.classList.remove("played-late");
      }, ext.config.guideNoteStaticsFadeOut)
    }
  }

  return entry
}

function clearLog() {
  document.getElementById("log").innerHTML = ''
  ext.history.playedNotes = []
  ext.stats.guideNoteTimings = []
}

function calculateStatistics() {
  const stats = {
    notesPlayed: ext.history.playedNotes.length,
    guideNotes: ext.stats.guideNoteTimings.length,
    inTimeNotes: 0,
    earlyNotes: 0,
    lateNotes: 0,
    missedNotes: 0,
  }
  let cumulatedTimingOffset = 0
  let timingOffsetCounter = 0
  for (const entry of ext.stats.guideNoteTimings) {
    if (Math.abs(entry.timingOffset) > ext.config.missedNoteThreshold) {
      stats.missedNotes += 1
    } else if (Math.abs(entry.timingOffset) <= ext.config.delayedNoteThreshold) {
      stats.inTimeNotes += 1
      timingOffsetCounter += 1
      cumulatedTimingOffset += Math.abs(entry.timingOffset)
    } else if (entry.timingOffset < 0) {
      stats.earlyNotes += 1
      timingOffsetCounter += 1
      cumulatedTimingOffset += Math.abs(entry.timingOffset)
    } else {
      stats.lateNotes += 1
      timingOffsetCounter += 1
      cumulatedTimingOffset += Math.abs(entry.timingOffset)
    }
  }

  stats.accidentalNotes = Math.max(0, stats.notesPlayed - stats.inTimeNotes - stats.earlyNotes - stats.lateNotes - stats.missedNotes)

  stats.avgTimingOffset = Math.round(cumulatedTimingOffset / (timingOffsetCounter || 1))
  stats.inTimeNotesRatio = Math.round((stats.inTimeNotes / (stats.notesPlayed || 1)) * 100) / 100
  stats.earlyNotesRatio = Math.round((stats.earlyNotes / (stats.notesPlayed || 1)) * 100) / 100
  stats.lateNotesRatio = Math.round((stats.lateNotes / (stats.notesPlayed || 1)) * 100) / 100
  stats.missedNotesRatio = Math.round((stats.missedNotes / (stats.notesPlayed || 1)) * 100) / 100
  stats.accidentalNotesRatio = Math.round((stats.accidentalNotes / (stats.notesPlayed || 1)) * 100) / 100

  // Calculate score between 0 and 1000
  // played early or late notes only give a quarter points
  // Any differences in played notes and guide notes counts like two missed note
  stats.score = Math.round((stats.inTimeNotes / (stats.notesPlayed || 1)) * 1000)
  stats.score += Math.round((stats.earlyNotes / (stats.notesPlayed || 1)) * 250)
  stats.score += Math.round((stats.lateNotes / (stats.notesPlayed || 1)) * 250)
  stats.score -= Math.round((stats.accidentalNotes / (stats.notesPlayed || 1)) * 2000)
  stats.score = Math.max(0, stats.score)

  console.debug(`Aggregated Statistics`, stats)

  let table = `Aggregated Statistics:`
  table += `<table class="table table-sm">`
  table += `<thead><tr><th scope="col">Score: ${stats.score}/1000 | Avg. Offset: ${stats.avgTimingOffset}ms</th><th scope="col"># Notes</th><th scope="col">Ratio</th></tr></thead>`
  table += `<tbody>`

  table += `<tr><th>Notes Played</th><td>${stats.notesPlayed}</td><td></td></tr>`
  table += `<tr><th class="text-success">In Time Notes</th><td>${stats.inTimeNotes}</td><td>${Math.round(stats.inTimeNotesRatio * 100)}%</td></tr>`
  table += `<tr><th class="text-info">Early Notes</th><td>${stats.earlyNotes}</td><td>${Math.round(stats.earlyNotesRatio * 100)}%</td></tr>`
  table += `<tr><th class="text-primary">Late Notes</th><td>${stats.lateNotes}</td><td>${Math.round(stats.lateNotesRatio * 100)}%</td></tr>`
  table += `<tr><th class="text-warning">Missed Notes</th><td>${stats.missedNotes}</td><td>${Math.round(stats.missedNotesRatio * 100)}%</td></tr>`
  table += `<tr><th class="text-danger">AccidentalNotes Notes</th><td>${stats.accidentalNotes}</td><td>${Math.round(stats.accidentalNotesRatio * 100)}%</td></tr>`

  table += `</tbody>`
  table += `</table>`

  log.info(table)
}

function checkForStatisticsDump() {
  if (ext.stats.guideNoteTimings.length > 0) {
    const lastItem = ext.stats.guideNoteTimings.slice(-1)[0] 
    if (lastItem.time < Date.now() - ext.config.guideNotesPausedThreshold) {
      console.debug('Guide Note Timings', ext.stats.guideNoteTimings)
      calculateStatistics()
      ext.stats.guideNoteTimings = []
    }
  }
}

function checkForMidiDump() {
  if (ext.history.playedNotes.length > 0) {
    const lastItem = ext.history.playedNotes.slice(-1)[0] 
    if (lastItem.time < Date.now() - ext.config.playedNotesPausedThreshold) {
      console.debug('Played Note History', ext.history.playedNotes)
      exportMidiInputRecording()
      createMidiInputRecording()
      ext.history.playedNotes = []
    }
  }
}

function createMidiInputRecording() {

  const tickResolution = 96 // ticks per quarter note

  // https://www.npmjs.com/package/jzz-midi-smf
  ext.history.midiInput.file = new JZZ.MIDI.SMF(0, tickResolution); // type 0, 96 ticks per quarter note
  ext.history.midiInput.track = new JZZ.MIDI.SMF.MTrk();
  ext.history.midiInput.file.push(ext.history.midiInput.track);
  
  ext.history.midiInput.track.add(0, JZZ.MIDI.smfSeqName(`Recording: ${new Date().toISOString()}`))
  ext.history.midiInput.track.add(0, JZZ.MIDI.smfBPM(ext.config.bpm));

  const tickInterval = 60000 / ext.config.bpm / 96
  ext.history.midiInput.tick = 0;
  ext.history.midiInput.tick = setInterval(() => {
    ext.history.midiInput.tick += 1
  }, tickInterval);
  
}

function exportMidiInputRecording() {
  ext.history.midiInput.track.add(ext.history.midiInput.tick, JZZ.MIDI.smfEndOfTrack());

  const smf = ext.history.midiInput.file

  const fileName = new Date().toISOString().split(':').join('-').split('T').join('_').split('.')[0] + '.mid'
  // var base64EncodedStr = btoa(unescape(encodeURIComponent(smf.dump())));
  var base64EncodedStr = btoa(smf.dump());

  const a = document.body.appendChild(
    document.createElement("a")
  );
  a.download = fileName;
  a.href = "data:audio/midi;base64," + base64EncodedStr;
  a.innerHTML = fileName;

  log.info('Played Notes MIDI: ' + a.outerHTML)

}

/**
 * Converts NRPN number to array of [MSB, LSB]
 */
function nrpn(nrpnValue) {
  const msb = nrpnValue >> 7;
  const lsb = nrpnValue & 0x7F;
  return [msb, lsb];
}

function debounce(func, time) {
  var time = time || 100; // 100 by default if no param
  var timer;
  return function (event) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(func, time, event);
  };
}

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
