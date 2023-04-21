import { ext } from './main.js'
import { log } from './log.js'

/**
 * Records MIDI input for later export to MIDI files
 * 
 * Uses https://www.npmjs.com/package/jzz-midi-smf
 */
export function createMidiInputRecording() {

  const tickResolution = 96 // ticks per quarter note

  // Create recording of instrument input
  ext.recording.midiInput.file = new JZZ.MIDI.SMF(0, tickResolution); // type 0, 96 ticks per quarter note
  ext.recording.midiInput.track = new JZZ.MIDI.SMF.MTrk();
  ext.recording.midiInput.file.push(ext.recording.midiInput.track);
  
  ext.recording.midiInput.track.add(0, JZZ.MIDI.smfSeqName(`Recording: ${new Date().toISOString()}`))
  ext.recording.midiInput.track.add(0, JZZ.MIDI.smfBPM(ext.config.bpm));

  // Create recording of guide note input
  ext.recording.guideInput.file = new JZZ.MIDI.SMF(0, tickResolution); // type 0, 96 ticks per quarter note
  ext.recording.guideInput.track = new JZZ.MIDI.SMF.MTrk();
  ext.recording.guideInput.file.push(ext.recording.guideInput.track);
  
  ext.recording.guideInput.track.add(0, JZZ.MIDI.smfSeqName(`Recording: ${new Date().toISOString()}`))
  ext.recording.guideInput.track.add(0, JZZ.MIDI.smfBPM(ext.config.bpm));

  // Set / reset tick
  const tickInterval = 60000 / ext.config.bpm / 96
  ext.recording.tick = 0;
  if (ext.recording.tickTimer) {
    clearInterval(ext.recording.tickTimer)
  }
  ext.recording.tickTimer = setInterval(() => {
    ext.recording.tick += 1
  }, tickInterval);
  
}

/**
 * Exports recorded MIDI as downloadable MIDI files from a link in the log
 */
export function exportMidiInputRecording() {
  
  // Export  recording of instrument input
  ext.recording.midiInput.track.add(ext.recording.tick, JZZ.MIDI.smfEndOfTrack());
  const smf = ext.recording.midiInput.file
  const fileName = new Date().toISOString().split(':').join('-').split('T').join('_').split('.')[0] + '-played.mid'

  const instrumentMidiLink = document.createElement("a")
  instrumentMidiLink.download = fileName;
  instrumentMidiLink.href = "data:audio/midi;base64," + btoa(smf.dump())
  instrumentMidiLink.innerHTML = fileName;

  log.info(`Played Notes MIDI: ${instrumentMidiLink.outerHTML}`)

  if (ext.recording.guideInput.track.length > 3) {
    // Export  recording of instrument input
    ext.recording.guideInput.track.add(ext.recording.tick, JZZ.MIDI.smfEndOfTrack());
  
    const smf2 = ext.recording.guideInput.file
    const fileName2 = new Date().toISOString().split(':').join('-').split('T').join('_').split('.')[0] + '-guide.mid'
    const guideMidiLink = document.createElement("a")
    guideMidiLink.download = fileName2;
    guideMidiLink.href = "data:audio/midi;base64," + btoa(smf2.dump());
    guideMidiLink.innerHTML = fileName2;
  
    log.info(`Guide Notes MIDI: ${guideMidiLink.outerHTML}`)
  }
}
