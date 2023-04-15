import { ext } from './main.js'

/**
 * Measure how the guide note is actually played
 * 
 * TODO: This currently only checks if a played note is close in time to the guide note
 *       There is no detection of wrong played notes that have no guide note, yet
 */
export async function measureNoteTiming(noteNumber) {
  return new Promise((resolve) => {
    let pastTimeOffset
    let futureTimeOffset
    let foundMatch = false
    const now = performance.now()

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
export function logGuideNoteTiming(entry) {
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


export function calculateStatistics() {
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
