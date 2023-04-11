import { log } from "./log.js";
import { initConfig, resetConfig, saveConfig } from "./config.js";
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
  await registerCallbacks()

  // Setup Grid
  resetGrid()
  ext.grid = generateGrid(ext.config.startNoteNumber, ext.config.rowOffset, ext.config.colOffset)
  ext.gridDict = getGridDict(ext.grid, ext.config.startNoteNumber)
  drawGrid(ext.grid)

  log.info(`Successfully initialized.`)
}


async function registerCallbacks() {
  // UI Buttons Listeners
  document.getElementById("save").addEventListener("click", (event) => {
    saveConfig(ext.config, event)
  });
  const inputElements = document.getElementsByTagName("input")
  for (const el of inputElements) {
    el.addEventListener("focusout", (event) => {
      console.log('save config')
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

  // Instrument Input
  if (ext.config.instrumentInputPort) {
    try {
      console.debug(`LinnStrument MIDI Input:`.padEnd(30, ' ') + ext.config.instrumentInputPort)
      ext.input = WebMidi.getInputByName(ext.config.instrumentInputPort)
      ext.input.addListener("noteon", (note) => {
        const noteNumber = note.dataBytes[0]
        ext.history.playedNotes.push({
          time: Date.now(),
          note: noteNumber,
          full: note,
        })
        highlightVisualization(noteNumber, 1)

      });
      ext.input.addListener("noteoff", (note) => {
        setTimeout(() => {
          highlightVisualization(note.dataBytes[0], 0)
        }, ext.config.fadeOutDelay);
      });


    } catch (err) {
      log.error(`Could not connect to Light Guide Input Port: ${ext.config.lightGuideInputPort}`)
      log.error(err.toString())
      console.error(err)
    }
  } else {
    log.error(`No Instrument Input Port given.`)
  }

  if (ext.config.instrumentOutputPort) {
    try {
      console.debug(`LinnStrument MIDI Output:`.padEnd(30, ' ') + ext.config.instrumentOutputPort)
      ext.output = WebMidi.getOutputByName(ext.config.instrumentOutputPort)
    } catch (err) {
      log.error(`Could not open Instrument Output Port: ${ext.config.instrumentInputPort}`)
    }
  } else {
    log.warn(`No Instrument Output Port given. Without this, Light Guide highlighting will not work.`)
  }

  // Light Guide Input
  if (ext.config.lightGuideInputPort) {
    try {
      console.debug(`Light Guide MIDI Input:`.padEnd(30, ' ') + ext.config.lightGuideInputPort)
      ext.lightGuideInput = WebMidi.getInputByName(ext.config.lightGuideInputPort)
      ext.lightGuideInput.addListener("noteon", (note) => {
        const noteNumber = note.dataBytes[0]
        ext.history.guideNotes.push({
          time: Date.now(),
          note: noteNumber,
          full: note,
        })
        highlightInstrument(noteNumber, ext.config.highlightColor)
        highlightVisualization(noteNumber, ext.config.highlightColor, 'guide', true)
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

  // Forward Instrument Input
  if (ext.input) {

    if (ext.config.forwardPort1) {
      try {
        ext.forwardPort1 = WebMidi.getOutputByName(ext.config.forwardPort1)
        ext.input.addForwarder(ext.forwardPort1)
        log.info(`MIDI Forward Port 1:`.padEnd(30, ' ') + ext.config.forwardPort1)
      } catch (err) {
        log.warn(`Could not open optional Forward Port 1: ${ext.config.forwardPort1}`)
      }
    }
  
    if (ext.config.forwardPort2) {
      try {
        ext.forwardPort2 = WebMidi.getOutputByName(ext.config.forwardPort2)
        ext.input.addForwarder(ext.forwardPort2)
        log.info(`MIDI Forward Port 2:`.padEnd(30, ' ') + ext.config.forwardPort2)
      } catch (err) {
        log.warn(`Could not open optional Forward Port 2: ${ext.config.forwardPort2}`)
      }
    }
  } else {
    log.warn(`No Instrument input found, cannot forward MIDI from it.`)
  }


}

//////////////////////////////////////////
// HELPER FUNCTIONS                     //
//////////////////////////////////////////

/**
 * Highlight pads on instrument by note number and color
 */
export function highlightInstrument(noteNumber, color) {
  const noteCoords = ext.gridDict[noteNumber]
  for (const noteCoord of noteCoords) {
    highlightInstrumentXY(noteCoord[0], noteCoord[1], color)
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

function debounce(func, time){
  var time = time || 100; // 100 by default if no param
  var timer;
  return function(event){
      if(timer) clearTimeout(timer);
      timer = setTimeout(func, time, event);
  };
}
