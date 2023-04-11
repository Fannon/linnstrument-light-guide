export const defaultConfig = {
  // MIDI Port Names
  instrumentInputPort: 'LinnStrument MIDI',
  instrumentOutputPort: 'LinnStrument MIDI',
  lightGuideInputPort: 'Loop Back C',
  forwardPort1: 'Loop Forward A',
  forwardPort2: 'Loop Forward B', // Optional
  
  // General Options
  highlightColor: 6,
  linnStrumentSize: 128,
  rowOffset: 5,
  startNoteNumber: 30,
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

  //////////////////////////////////////////
  // WRITE SETTINGS INTO FORM             //
  //////////////////////////////////////////

  document.getElementById('startNoteNumber').value = config.startNoteNumber.toString()
  document.getElementById('rowOffset').value = config.rowOffset.toString()
  document.getElementById('highlightColor').value = config.highlightColor.toString()
  document.getElementById('linnStrumentSize').value = config.linnStrumentSize.toString()

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
  const noValue = document.createElement("option");
  noValue.text = ''; 
  document.getElementById('forwardPort2').add(noValue)
  WebMidi.outputs.forEach((device) => {
    const option = document.createElement("option");
    option.text = device.name; 
    if (config.forwardPort2 === device.name) {
      option.selected = true
    } 
    document.getElementById('forwardPort2').add(option)
  });

  console.debug('Config', config)

  return config
}

export function saveConfig(config, event) {
  if (event) {
    event.preventDefault() 
  }

  config.startNoteNumber = parseInt(document.getElementById("startNoteNumber").value);
  config.rowOffset = parseInt(document.getElementById("rowOffset").value);
  config.highlightColor = parseInt(document.getElementById("highlightColor").value);
  config.linnStrumentSize = parseInt(document.getElementById("linnStrumentSize").value);

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
