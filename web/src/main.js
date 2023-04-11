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
// OPTIONS                              //
//////////////////////////////////////////

WebMidi.enable().then(init).catch(console.error);

// Function triggered when WEBMIDI.js is ready
async function init() {

  ext.config = initConfig()

  console.debug(`LinnStrument MIDI Input:`.padEnd(30, ' ') + ext.config.instrumentInputPort)
  ext.input = WebMidi.getInputByName(ext.config.instrumentInputPort)
  console.debug(`LinnStrument MIDI Output:`.padEnd(30, ' ') + ext.config.instrumentOutputPort)
  ext.output = WebMidi.getOutputByName(ext.config.instrumentOutputPort)
  console.debug(`Light Guide MIDI Input:`.padEnd(30, ' ') + ext.config.lightGuideInputPort)
  ext.lightGuideInput = WebMidi.getInputByName(ext.config.lightGuideInputPort)

  resetGrid()

  ext.grid = generateGrid(ext.config.rowOffset, ext.config.startNoteNumber)
  ext.gridDict = getGridDict(ext.grid, ext.config.startNoteNumber)
  drawGrid(ext.grid)

  await registerCallbacks()

  log.info(`Successfully initialized.`)
}


async function registerCallbacks() {

  // UI Buttons Listeners
  document.getElementById("save").addEventListener("click", (event) => {
    saveConfig(ext.config, event)
  });
  document.getElementById("reset").addEventListener("click", (event) => {
    resetConfig(event)
  });

  // Instrument Input
  try {
    
    ext.input.addListener("noteon", (note) => {
      const noteNumber = note.dataBytes[0]
      ext.history.playedNotes.push({
        time: Date.now(),
        note: noteNumber,
        full: note,
      })
      console.log('Played ON', note)

      const noteCoords = ext.gridDict[noteNumber]
      for (const noteCoord of noteCoords) {
        highlightVisualization(noteCoord[0], noteCoord[1], 1)
      }
    });
    ext.input.addListener("noteoff", (note) => {
      const noteNumber = note.dataBytes[0]
      const noteCoords = ext.gridDict[noteNumber]

      setTimeout(() => {
        for (const noteCoord of noteCoords) {
          highlightVisualization(noteCoord[0], noteCoord[1], 0)
        }
      }, ext.config.fadeOutDelay);
    });


  } catch (err) {
    log.error(`Could not connect to Light Guide Input Port: ${ext.config.lightGuideInputPort}`)
    log.error(err.toString())
    console.error(err)
  }

  // Light Guide Input
  try {

    ext.lightGuideInput.addListener("noteon", (note) => {
      const noteNumber = note.dataBytes[0]
      ext.history.guideNotes.push({
        time: Date.now(),
        note: noteNumber,
        full: note,
      })
      let logMsg = `Guide Note: ${noteNumber.toString().padStart(3, '0')} | Highlighted on:`
      const noteCoords = ext.gridDict[noteNumber]
      for (const noteCoord of noteCoords) {
        highlightInstrument(noteCoord[0], noteCoord[1], ext.config.highlightColor)
        highlightVisualization(noteCoord[0], noteCoord[1], ext.config.highlightColor, 'guide', true)
        logMsg += ` [${noteCoord[0].toString().padStart(2, '0')}, ${noteCoord[1].toString().padStart(2, '0')}]`
      }
      log.info(logMsg)
    });

    ext.lightGuideInput.addListener("noteoff", (note) => {
      const noteNumber = note.dataBytes[0]
      const noteCoords = ext.gridDict[noteNumber]
      setTimeout(() => {
        for (const noteCoord of noteCoords) {
          highlightInstrument(noteCoord[0], noteCoord[1], 0)
          highlightVisualization(noteCoord[0], noteCoord[1], 0, 'guide')
        }
      }, ext.config.fadeOutDelay);
      
    });
  } catch (err) {
    log.error(`Could not connect to Light Guide Input Port: ${ext.config.lightGuideInputPort}`)
    log.error(err.toString())
    console.error(err)
  }


  // Forward Instrument Input
  ext.forwardPort1 = WebMidi.getOutputByName(ext.config.forwardPort1)
  ext.input.addForwarder(ext.forwardPort1)
  console.debug(`MIDI Forward Port 1:`.padEnd(30, ' ') + ext.config.forwardPort1)

  if (ext.config.forwardPort2) {
    try {
      ext.forwardPort2 = WebMidi.getOutputByName(ext.config.forwardPort2)
      ext.input.addForwarder(ext.forwardPort2)
      console.debug(`MIDI Forward Port 2:`.padEnd(30, ' ') + ext.config.forwardPort2)
    } catch (err) {
      log.warn(`Could not open optional Forward Port 2: ${ext.config.forwardPort2}`)
    }
  }

}

//////////////////////////////////////////
// HELPER FUNCTIONS                     //
//////////////////////////////////////////

export function highlightInstrument(x, y, color) {
  // console.debug(`Highlighting`, x.toString().padStart(2, '0'), y.toString().padStart(2, '0'), color)
  const channel = ext.output.channels[1]
  channel.sendControlChange(20, x + 1); // Add one because 0 is settings
  channel.sendControlChange(21, y);
  channel.sendControlChange(22, color);

}

export function highlightVisualization(x, y, color, type = "played", big = false) {

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
  
    cell.appendChild(highlightEl)
  }

}
