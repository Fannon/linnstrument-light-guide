# LinnStrument Synthesia Light Guide Support

## Description

[Synthesia](https://synthesiagame.com/) offers a "Light Guide" feature for some keyboards.
LinnStrument is not directly supported, but with this script it's still possible to have it.

![Synthesia Light Guide](./assets/synthesia-light-guide.png)

### How to use

Setting this up is a big fiddly. 
This is also in part due to how there are many MIDI ports and loops needed to route MIDI information from and to the right places.
Personally, I'm using a DAW to hear my own notes, the synthesia notes and drums / metronome with low latency.

* You need to have a virtual MIDI Loop Device (e.g. loopMIDI) where Synthesia sends KeyLights to the Output.
  * On Windows you can use a tool like [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)
  * You need to setup at least two Loop ports:
    * One for receiving forwarded LinnStrument MIDI notes (This scripts defaults to `Loop Forward A`)
    * One for sending Synthesia Light Guide information (This scripts defaults to `Loop Back C`)
  * Personally, I've set up three more Loop Devices, so I can use my DAW to hear / mix everything with low latency:
    * One for sending Synthesia background MIDI (teachers piano) to my DAW (`Loop Back A`)
    * One for sending Synthesia drum & metronome MIDI (teachers piano) to my DAW (`Loop Back B`)
    * One for sending LinnStrument MIDI notes to the DAW (`Loop Forward B`)

![LoopMIDI Setup](./assets/loopMIDI.png)

* Optionally: Setup a DAW to hear your own and Synthesias sounds in real-time without latency. I've setup three tracks:
  * Own Piano: Listens to `Loop Forward B` (which is the MIDI Thru of LinnStrument)
  * Teachers Piano: Listens to `Loop Back A` to play Synthesia notes
  * Drums & Metronome: Listens to `Loop Back B` to play Synthesia drum and metronome sounds

![DAW Setup](./assets/daw.png)

* Configure Synthesia Music Input:
  * Receive player notes from `Loop Forward A`

![Synthesia Input Config](./assets/synthesia-input.png)

* Configure Synthesia Music Output:
  * Send "Key Lights" to `Loop Back C`, using "Finger-based channel" mode.
  * Optional: Send "Background" to `Loop Back A`.
  * Optional: Send "Percussion, Metronome" to `Loop Back B`.

![Synthesia Output Config](./assets/synthesia-output.png)

Now everything should be ready. Start the webapp at https://fannon.github.io/linnstrument-synthesia-light-guide/.
Make sure to use a modern browser that supports WebMIDI like Google Chrome or MS Edge.

Make sure that the configuration is correct and matches your MIDI input and output ports.

Have fun :)

### TODO

* Find out starting note and row offset automatically or ask the player to play two/three notes to detect it?
* Does not support / detect transpose on the fly. 

