import { log } from "./log.js";
import { initConfig, resetConfig, saveConfig, updateSettingsInUI } from "./config.js";
import { resetGrid, getGridDict, generateGrid, drawGrid } from "./grid.js";

/**
 * Global namespace
 */
const ext = {
  config: {},
  history: {
    playedNotes: [],
    guideNotes: [],
  },

  stats: {},
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
  setupGrid()

  // Put LinnStrument out of User Firmware Mode (if it still is)
  ext.output.sendNrpnValue(nrpn(245), nrpn(0), { channels: 1 });

  log.info(`Successfully initialized.`)

  await updateLayoutFromLinnStrument()
  setInterval(async () => {
    await updateLayoutFromLinnStrument()
  }, ext.config.updateLayoutInterval);
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
    const inputElements = document.getElementsByTagName("input")
    for (const el of inputElements) {
      el.addEventListener("focusout", (event) => {
        saveConfig(ext.config, event)
      });
    }
    document.getElementById("reset").addEventListener("click", (event) => {
      resetConfig(event)
    });
  
    // UI Resize trigger
    window.addEventListener("resize", debounce(() => {
      drawGrid(ext.grid)
    }, 200 ));
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
      ext.input.addListener("noteon", (note) => {
        const noteNumber = note.dataBytes[0]
        ext.history.playedNotes.push({
          time: Date.now(),
          note: noteNumber,
          full: note,
        })
        highlightVisualization(noteNumber, ext.config.playedHighlightColor)
      });
      ext.input.addListener("noteoff", (note) => {
        setTimeout(() => {
          highlightVisualization(note.dataBytes[0], 0)
        }, ext.config.fadeOutDelay);
      });
      // ext.input.channels[1].addListener("nrpn", (msg) => {
      //   console.debug(`MIDI Input NRPN`, msg.message.data, msg)
      // })
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
      ext.lightGuideInput.addListener("noteon", (note) => {
        const noteNumber = note.dataBytes[0]
        ext.history.guideNotes.push({
          time: Date.now(),
          note: noteNumber,
          full: note,
        })
        highlightInstrument(noteNumber, ext.config.guideHighlightColor)
        highlightVisualization(noteNumber, ext.config.guideHighlightColor, 'guide', true)
      });
  
      ext.lightGuideInput.addListener("noteoff", (note) => {
        const noteNumber = note.dataBytes[0]
        setTimeout(() => {
          highlightInstrument(noteNumber, 0)
          highlightVisualization(noteNumber, 0, 'guide')
        }, ext.config.fadeOutDelay);
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
  console.debug(`highlightInstrument`, noteNumber, color)
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
  const rowOffset = await getLinnStrumentParamValue(227);
  
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
    }, { duration: 200})
    setTimeout(() => {
      reject(new Error(`Timeout when getting NRPN value readout`))
    }, 300);
  });
}

/**
 * Converts NRPN number to array of [MSB, LSB]
 */
function nrpn(nrpnValue) {
  const msb = nrpnValue >> 7;
  const lsb = nrpnValue & 0x7F;
  return [msb, lsb];
}

function debounce(func, time){
  var time = time || 100; // 100 by default if no param
  var timer;
  return function(event){
      if(timer) clearTimeout(timer);
      timer = setTimeout(func, time, event);
  };
}

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
