import { log } from "./log.js";
import { initConfig, resetConfig, saveConfig } from "./config.js";

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

  // Light Guide Input
  try {
    ext.lightGuideInput.addListener("noteon", (msg) => {
      const note = msg.dataBytes[0]
      ext.history.guideNotes.push({
        time: Date.now(),
        note: note,
        full: msg,
      })
      let logMsg = `Guide Note: ${note.toString().padStart(3, '0')} | Highlighted on:`
      const noteCoords = ext.grid[note]
      for (const noteCoord of noteCoords) {
        highlightNote(noteCoord[0], noteCoord[1], ext.config.highlightColor)
        logMsg += ` [${noteCoord[0].toString().padStart(2, '0')}, ${noteCoord[1].toString().padStart(2, '0')}]`
      }
      log.info(logMsg)
    });
    ext.lightGuideInput.addListener("noteoff", (msg) => {
      const note = msg.dataBytes[0]
      const noteCoords = ext.grid[note]
      for (const noteCoord of noteCoords) {
        highlightNote(noteCoord[0], noteCoord[1], 0)
      }
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

  document.getElementById('loading-status').innerHTML = `<span class="badge bg-success">Initialized.</span>`;

}

//////////////////////////////////////////
// HELPER FUNCTIONS                     //
//////////////////////////////////////////

function highlightNote(x, y, color) {
  // console.debug(`Highlighting`, x.toString().padStart(2, '0'), y.toString().padStart(2, '0'), color)
  const channel = ext.output.channels[1]
  channel.sendControlChange(20, x);
  channel.sendControlChange(21, y);
  channel.sendControlChange(22, color);
}

/**
 * Calculate the grid for the LinnStrument
 * where each MIDI note can be found by x and y coordinates
 * 
 * @param rowOffset How many half tone steps the layout has
 * @param startNoteNumber Which midi note the grid starts with (bottom left corner)
 * @returns 
 */
function generateGrid(rowOffset = 5, startNoteNumber = 30) {

  const columns = ext.config.linnStrumentSize / 8

  // First generate the grid with the note numbers as it is on the LinnStrument
  const grid = []

  for (let x = 0; x <= columns; x++) {
    grid[x] = []
    for (let y = 0; y <= 7; y++) {
      grid[x][y] = startNoteNumber + x + (y * rowOffset)
    }
  }

  // Now create a dictionary that lists me all grid coordinates for a given note
  // This is used to speed up the access to find the coordinates
  const gridDict = {}

  for (let note = startNoteNumber; note <= 127; note++) {
    gridDict[note] = []
    for (let x = 0; x <= columns; x++) {
      for (let y = 0; y <= 7; y++) {
        if (grid[x][y] === note) {
          gridDict[note].push([x + 1, y])
        }
      }
    }
  }

  console.debug(`Generated Grid with start note="${startNoteNumber}" and row offset=${rowOffset}`, grid)

  return gridDict;
}

/**
 * Helper function that resets all color highlights from the grid
 * by brute force
 */
function resetGrid() {
  const columns = ext.config.linnStrumentSize / 8
  for (let x = 0; x <= columns; x++) {
    for (let y = 0; y <= 7; y++) {
      highlightNote(x, y, 0)
    }
  }
}


