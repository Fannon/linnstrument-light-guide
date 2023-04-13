export const defaultConfig = {

  //////////////////////////////////////////
  // MIDI Port Names                      //
  //////////////////////////////////////////

  instrumentInputPort: 'LinnStrument MIDI',
  instrumentOutputPort: 'LinnStrument MIDI',
  lightGuideInputPort: 'Loop Back C',
  forwardPort1: 'Loop Forward A',
  forwardPort2: 'Loop Forward B',

  //////////////////////////////////////////
  // General Options                      //
  //////////////////////////////////////////

  playedHighlightColor: 1,
  guideHighlightColor: 3,
  linnStrumentSize: 128,
  rowOffset: 5,
  colOffset: 1,
  startNoteNumber: 30,
  /** If the time offset is lower than this, the note is considered "in-time" (in ms) */
  inTimeThreshold: 100,
  /** 
   * If the time offset is higher than this, the note is considered a missed note. (in ms)
   * After this time, the app will stop looking and consider it a missed note. 
   */
  missedNoteThreshold: 500,

  //////////////////////////////////////////
  // Advanced Options (no UI)             //
  //////////////////////////////////////////

  /** Interval for updating the state, e.g. checking LinnStrument layout,  */
  updateStateInterval: 200, // in ms
  guideNoteStatistics: true,
  /** How long the guide note feedback stays visible (colorized border around the cell) (in ms) */
  guideNoteStaticsFadeOut: 1500,
  /** How long a played note / guide note stays after note off (in ms) */
  fadeOutDelay: 200,
  /** Time after no guide notes until statistics get printed and reset */
  playingBreakThreshold: 3000, // in ms

}

export function initConfig() {
  let config = defaultConfig
  const userConfig = localStorage.getItem("config");
  
  if (userConfig) {
    config = {
      ...config,
      ...JSON.parse(userConfig)
    }
  }

  updateSettingsInUI(config)

  console.debug('Config', config)

  return config
}

export function updateSettingsInUI(config) {

  document.getElementById('startNoteNumber').value = config.startNoteNumber.toString()
  document.getElementById('rowOffset').value = config.rowOffset.toString()
  document.getElementById('colOffset').value = config.colOffset.toString()
  document.getElementById('guideHighlightColor').value = config.guideHighlightColor.toString()
  document.getElementById('playedHighlightColor').value = config.playedHighlightColor.toString()
  document.getElementById('linnStrumentSize').value = config.linnStrumentSize.toString()
  document.getElementById('inTimeThreshold').value = config.inTimeThreshold.toString()
  document.getElementById('missedNoteThreshold').value = config.missedNoteThreshold.toString()

  // instrumentInputPort
  WebMidi.inputs.forEach((device) => {
    const option = document.createElement("option");
    option.text = device.name; 
    if (config.instrumentInputPort === device.name) {
      option.selected = true
    } 
    document.getElementById('instrumentInputPort').add(option)
  });

  // instrumentOutputPort
  WebMidi.outputs.forEach((device) => {
    const option = document.createElement("option");
    option.text = device.name; 
    if (config.instrumentOutputPort === device.name) {
      option.selected = true
    } 
    document.getElementById('instrumentOutputPort').add(option)
  });
  // lightGuideInputPort
  WebMidi.inputs.forEach((device) => {
    const option = document.createElement("option");
    option.text = device.name; 
    if (config.lightGuideInputPort === device.name) {
      option.selected = true
    } 
    document.getElementById('lightGuideInputPort').add(option)
  });
  // forwardPort1
  WebMidi.outputs.forEach((device) => {
    const option = document.createElement("option");
    option.text = device.name; 
    if (config.forwardPort1 === device.name) {
      option.selected = true
    } 
    document.getElementById('forwardPort1').add(option)
  });
  // forwardPort2
  WebMidi.outputs.forEach((device) => {
    const option = document.createElement("option");
    option.text = device.name; 
    if (config.forwardPort2 === device.name) {
      option.selected = true
    } 
    document.getElementById('forwardPort2').add(option)
  });
}

export function saveConfig(config, event) {
  if (event) {
    event.preventDefault() 
  }

  config.startNoteNumber = parseInt(document.getElementById("startNoteNumber").value);
  config.rowOffset = parseInt(document.getElementById("rowOffset").value);
  config.colOffset = parseInt(document.getElementById("colOffset").value);
  config.guideHighlightColor = parseInt(document.getElementById("guideHighlightColor").value);
  config.playedHighlightColor = parseInt(document.getElementById("playedHighlightColor").value);
  config.linnStrumentSize = parseInt(document.getElementById("linnStrumentSize").value);
  config.inTimeThreshold = parseInt(document.getElementById("inTimeThreshold").value);
  config.missedNoteThreshold = parseInt(document.getElementById("missedNoteThreshold").value);

  config.instrumentInputPort = document.getElementById("instrumentInputPort").value;
  config.instrumentOutputPort = document.getElementById("instrumentOutputPort").value;
  config.lightGuideInputPort = document.getElementById("lightGuideInputPort").value;
  config.forwardPort1 = document.getElementById("forwardPort1").value;
  config.forwardPort2 = document.getElementById("forwardPort2").value;

  localStorage.setItem("config", JSON.stringify(config));
  location.reload()
}

export function resetConfig(event) {
  if (event) {
    event.preventDefault() 
  }
  localStorage.removeItem("config")
  location.reload()
}
