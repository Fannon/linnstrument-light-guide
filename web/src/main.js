import { log } from "./log.js";
import { initConfig, resetConfig, saveConfig, updateSettingsInUI } from "./config.js";
import { resetGrid, getGridDict, generateGrid, drawGrid } from "./grid.js";
import { measureNoteTiming, calculateStatistics, logGuideNoteTiming } from "./statistics.js";
import { createMidiInputRecording, exportMidiInputRecording } from "./recorder.js";

/**
 * Global namespace, aliased to `window.ext`
 */
export const ext = {
  config: {},
  history: {
    /** Only played note-on messages */
    playedNotes: [],
  },
  recording: {
    tick: 0,
    tickTimer: null,
    /** instrument incoming MIDI input message */
    midiInput: {
      file: null,
      track: null,
    },
    /** guide notes incoming MIDI input message */
    guideInput: {
      file: null,
      track: null,
    },
  },
  stats: {
    guideNoteTimings: [],
  },
  device: {
    linnStrument: {
      lastStateUpdate: null,
    }
  },
  fn: {
    resetGrid,
    resetConfig,
    init,
    resetLinnStrumentState: resetState,
    clearLog,
    clearHistory,
  }
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

  log.info(`Successfully initialized.`)

  // Infer current layout / transposition from LinnStrument directly
  try {
    await getStateFromLinnStrument()
  } catch (err) {
    log.warn('Could not get state from LinnStrument, please adjust config manually.')
  }
  
  // Periodically sync state between LinnStrument, app and player
  // This runs every 100ms, but the real intervals are checked by the functions
  // and is different for each functionality
  setInterval(async () => {
    checkForStatisticsDump()
    checkForMidiDump()
    try {
      await getStateFromLinnStrument()
    } catch (ignore) {}
  }, 100);

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
  document.getElementById("reset-config").addEventListener("click", resetConfig);
  document.getElementById("reset-state").addEventListener("click", resetState);
  document.getElementById("clear-log").addEventListener("click", clearLog);
  document.getElementById("clear-history").addEventListener("click", clearHistory);
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
      ext.input = WebMidi.getInputByName(ext.config.instrumentInputPort)
      if (!ext.input) {
        throw new Error('Could not connect to Instrument MIDI Input')
      }
      ext.input.addListener("noteon", (msg) => {
        const noteNumber = msg.dataBytes[0]
        ext.history.playedNotes.push({
          time: performance.now(),
          noteNumber: msg.note.number,
        })
        highlightVisualization(noteNumber, ext.config.playedHighlightColor)

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOn(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.recording.midiInput.track.add(ext.recording.tick, jzzMsg);
      });
      ext.input.addListener("noteoff", (msg) => {
        highlightVisualization(msg.dataBytes[0], 0)

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOff(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.recording.midiInput.track.add(ext.recording.tick, jzzMsg);
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
          const jzzMsg = JZZ.MIDI.control(msg.message.channel, msg.controller.number, msg.rawValue)
          ext.recording.midiInput.track.add(ext.recording.tick, jzzMsg);
        }
      })

      log.success(`Connected to Instrument MIDI Input: ${ext.config.instrumentInputPort}`)

    } catch (err) {
      log.error(`Could not connect to Instrument MIDI Input: ${ext.config.instrumentInputPort}`)
      console.error(err)
    }
  } else {
    log.error(`No Instrument MIDI Input given.`)
  }

  //////////////////////////////////////////
  // INSTRUMENT 2 INPUT                     //
  //////////////////////////////////////////

  // TODO: This is mostly copy'n'pasted from above. Could be refactored to be nicer.
  if (ext.config.instrumentInputPort2) {
    try {
      ext.input2 = WebMidi.getInputByName(ext.config.instrumentInputPort2)
      if (!ext.input2) {
        throw new Error('Could not connect to Instrument 2 MIDI Input')
      }
      ext.input2.addListener("noteon", (msg) => {
        const noteNumber = msg.dataBytes[0]
        ext.history.playedNotes.push({
          time: performance.now(),
          noteNumber: msg.note.number,
        })
        highlightVisualization(noteNumber, ext.config.playedHighlightColor)

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOn(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.recording.midiInput.track.add(ext.recording.tick, jzzMsg);
      });
      ext.input2.addListener("noteoff", (msg) => {
        highlightVisualization(msg.dataBytes[0], 0)

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOff(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.recording.midiInput.track.add(ext.recording.tick, jzzMsg);
      });
      ext.input2.addListener("controlchange", (msg) => {
        // Filter out NRPN / RPN messages
        const ignoredSubTypes = [
          "dataentrycoarse", "dataentryfine", 
          "registeredparametercoarse", "registeredparameterfine",
          "nonregisteredparametercoarse", "nonregisteredparameterfine",
        ]
        // Add it to MIDI input recording
        if (!ignoredSubTypes.includes(msg.subtype)) {
          const jzzMsg = JZZ.MIDI.control(msg.message.channel, msg.controller.number, msg.rawValue)
          ext.recording.midiInput.track.add(ext.recording.tick, jzzMsg);
        }
      })

      log.success(`Connected to Instrument 2 MIDI Input: ${ext.config.instrumentInputPort2}`)

    } catch (err) {
      log.error(`Could not connect to Instrument 2 MIDI Input: ${ext.config.instrumentInputPort2}`)
      console.error(err)
    }
  } else {
    log.error(`No Instrument 2 MIDI Input given.`)
  }


  //////////////////////////////////////////
  // INSTRUMENT OUTPUT                    //
  //////////////////////////////////////////

  if (ext.config.instrumentOutputPort) {
    try {
      ext.output = WebMidi.getOutputByName(ext.config.instrumentOutputPort)
      if (!ext.output) {
        throw new Error('Could not connect to instrument MIDI Output')
      }
      log.success(`Connected to LinnStrument MIDI Output: ${ext.config.instrumentOutputPort}`)
    } catch (err) {
      log.warn(`Could not connect to Instrument MIDI Output: ${ext.config.instrumentInputPort}`)
      console.warn(err)
    }
  } else {
    log.warn(`No Instrument MIDI Output given. Without this, Light Guide highlighting and layout detection will not work.`)
  }

  //////////////////////////////////////////
  // LIGHT GUIDE INPUT                    //
  //////////////////////////////////////////

  if (ext.config.lightGuideInputPort) {
    try {
      ext.lightGuideInput = WebMidi.getInputByName(ext.config.lightGuideInputPort)

      if (!ext.lightGuideInput) {
        throw new Error('Could not connect to Light Guide MIDI Input')
      }

      // Support "typical" Light Guide where noteon / noteoff MIDI events are used
      ext.lightGuideInput.addListener("noteon", async (msg) => {
        const noteNumber = msg.dataBytes[0]
        highlightInstrument(noteNumber, ext.config.guideHighlightColor)
        highlightVisualization(noteNumber, ext.config.guideHighlightColor, 'guide', true)

        if (ext.config.guideNoteStatistics) {
          const timing = await measureNoteTiming(noteNumber)
          logGuideNoteTiming(timing)
        }

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOn(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.recording.guideInput.track.add(ext.recording.tick, jzzMsg);
      });
      ext.lightGuideInput.addListener("noteoff", (msg) => {
        const noteNumber = msg.dataBytes[0]
        highlightInstrument(noteNumber, 0)
        highlightVisualization(noteNumber, 0, 'guide')

        // Add it to MIDI input recording
        const jzzMsg = JZZ.MIDI.noteOff(msg.message.channel, msg.note.number, msg.rawVelocity)
        ext.recording.guideInput.track.add(ext.recording.tick, jzzMsg);
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

      log.success(`Connected to Light Guide MIDI Input: ${ext.config.lightGuideInputPort}`)

    } catch (err) {
      log.error(`Could not connect to Light Guide MIDI Input: ${ext.config.lightGuideInputPort}`)
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
        if (!ext.forwardPort1) {
          throw new Error('Could not connect to Forward MIDI Port 1')
        }
        ext.input.addForwarder(ext.forwardPort1)
        if (ext.input2) {
          ext.input2.addForwarder(ext.forwardPort1)
        }
        log.success(`Connected MIDI Forward Port 1: ${ext.config.forwardPort1}`)
      } catch (err) {
        log.warn(`Could not connect to optional Forward Port 1: ${ext.config.forwardPort1}`)
      }
    }
    if (ext.config.forwardPort2) {
      try {
        ext.forwardPort2 = WebMidi.getOutputByName(ext.config.forwardPort2)
        if (!ext.forwardPort2) {
          throw new Error('Could not connect to Forward MIDI Port 1')
        }
        ext.input.addForwarder(ext.forwardPort2)
        if (ext.input2) {
          ext.input2.addForwarder(ext.forwardPort2)
        }
        log.success(`Connected MIDI Forward Port 2: ${ext.config.forwardPort2}`)
      } catch (err) {
        log.warn(`Could not connect to optional Forward Port 2: ${ext.config.forwardPort2}`)
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
 * Will only work if we have Instrument MIDI Output
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

async function getStateFromLinnStrument() {

  if (ext.device.linnStrument.lastStateUpdate && performance.now() - ext.config.updateInstrumentStateInterval <= ext.device.linnStrument.lastStateUpdate) {
    return
  }
  ext.device.linnStrument.lastStateUpdate = performance.now()
  
  if (ext.output && ext.input) {
    try {
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
        log.info(`Detected state from LinnStrument: startNoteNumber=${startNoteNumber}, rowOffset=${rowOffset}, bpm=${ext.config.bpm}`)
      }
      ext.device.linnStrument.lastStateUpdate = performance.now()
    } catch (err) {
      console.warn(`Could not get state from LinnStrument, please adjust config manually.`)
      ext.device.linnStrument.lastStateUpdate = performance.now() + 3000
      throw err
    }
  } else {
    console.warn(`Cannot get state from LinnStrument because instrument input or output device is missing.`)
    ext.device.linnStrument.lastStateUpdate = performance.now() + 3000
  }
}

async function getLinnStrumentParamValue(paramNumber) {
  const timeout = 300
  if (!ext.input) {
    log.warn('Cannot getLinnStrumentParamValue, because no input device')
    return
  }
  return promiseTimeout(timeout, new Promise((resolve) => {
    ext.output.sendNrpnValue(nrpn(299), nrpn(paramNumber), { channels: 1 });
    ext.input.channels[1].addListener("nrpn", (msg) => {
      if (msg.message.dataBytes[0] === 38) {
        return resolve(msg.message.dataBytes[1])
      }
    }, { duration: timeout })
  }))
}

async function resetState() {
  // Put LinnStrument out of User Firmware Mode (if it still is)
  if (ext.output) {
    ext.output.sendNrpnValue(nrpn(245), nrpn(1), { channels: 1 });
    sleep(100)
    ext.output.sendNrpnValue(nrpn(245), nrpn(0), { channels: 1 });
    sleep(100)
    resetGrid()
    log.success(`Successfully reset LinnStrument and app state.`)
  }
}

function clearLog() {
  document.getElementById("log").innerHTML = ''
}

function clearHistory() {
  ext.history.playedNotes = []
  ext.stats.guideNoteTimings = []
  createMidiInputRecording()
}

function checkForStatisticsDump() {
  if (ext.stats.guideNoteTimings.length > 0) {
    const lastItem = ext.stats.guideNoteTimings.slice(-1)[0] 
    if (lastItem && lastItem.time < performance.now() - ext.config.guideNotesPausedThreshold) {
      console.debug('Guide Note Timings', ext.stats.guideNoteTimings)
      calculateStatistics()
      ext.stats.guideNoteTimings = []
    }
  }
}

function checkForMidiDump() {
  if (ext.recording.midiInput.track.length > 3) {
    const lastItem = ext.history.playedNotes.slice(-1)[0]
    if (lastItem.time < performance.now() - ext.config.playedNotesPausedThreshold) {
      exportMidiInputRecording()
      createMidiInputRecording()
    }
  }
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * https://italonascimento.github.io/applying-a-timeout-to-your-promises/
 */
function promiseTimeout(ms, promise) {

  // Create a promise that rejects in <ms> milliseconds
  let timeout = new Promise((resolve, reject) => {
    let id = setTimeout(() => {
      clearTimeout(id);
      reject('Timed out in '+ ms + 'ms.')
    }, ms)
  })

  // Returns a race between our timeout and the passed in promise
  return Promise.race([
    promise,
    timeout
  ])
}
