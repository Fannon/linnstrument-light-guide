import { highlightInstrument } from "./main.js"

/**
 * Calculate the grid for the LinnStrument
 * where each MIDI note can be found by x and y coordinates
 * 
 * @param rowOffset How many half tone steps the layout has
 * @param startNoteNumber Which midi note the grid starts with (bottom left corner)
 * @returns 
 */
export function generateGrid(rowOffset = 5, startNoteNumber = 30) {

  const columns = ext.config.linnStrumentSize / 8

  // First generate the grid with the note numbers as it is on the LinnStrument
  const grid = []

  for (let x = 0; x <= columns; x++) {
    grid[x] = []
    for (let y = 0; y <= 7; y++) {
      grid[x][y] = startNoteNumber + x + (y * rowOffset)
    }
  }

  console.debug(`Generated Grid with start note="${startNoteNumber}" and row offset=${rowOffset}`, grid)

  return grid;
}

/**
 * Converts a 2 dimensional grid array to a dictionary
 * that speeds up note access to where a particular note is on the grid
 */
export function getGridDict(grid, startNoteNumber) {

  // Now create a dictionary that lists me all grid coordinates for a given note
  // This is used to speed up the access to find the coordinates
  const gridDict = {}

  for (let note = startNoteNumber; note <= 127; note++) {
    gridDict[note] = []
    grid.forEach((col, x) => {
      col.forEach((row, y) => {
        if (grid[x][y] === note) {
          gridDict[note].push([x, y])
        }
      })
    })
  }

  return gridDict;
}

/**
 * Helper function that resets all color highlights from the grid
 * by brute force
 */
export function resetGrid() {
  const columns = ext.config.linnStrumentSize / 8
  for (let x = 0; x <= columns; x++) {
    for (let y = 0; y <= 7; y++) {
      highlightInstrument(x, y, 0)
    }
  }

  document.querySelectorAll('.highlight').forEach(e => e.remove());

}

export function drawGrid(grid) {
  const v = document.getElementById('visualization')
  const cols = grid[0].length
  const rows = grid.length
  const padSize = Math.floor(v.offsetWidth / rows) - 7;

  for (let y = cols - 1; y >= 0; y--) { // draw inverse

    const columnEl = document.createElement('div')
    columnEl.className = 'column'
    columnEl.style = `height: ${padSize + 6}px;`
    v.appendChild(columnEl)

    for (let x = 0; x < rows; x++) {

      const noteNumber = grid[x][y]
      const note = new Note(noteNumber)
      const noteName = note.identifier
      const noteClass = `${note.name}${note.accidental ? '-sharp' : ''}`

      const cellEl = document.createElement('span')
      cellEl.id = `cell-${x}-${y}`
      cellEl.className = `cell note-number-${noteNumber} note-name-${noteClass}`
      cellEl.style = `height: ${padSize}px; width: ${padSize}px;`
      cellEl.textContent = noteName

      columnEl.appendChild(cellEl)
    }
  }

}
