# LinnStrument Synthesia Light Guide Support

## Description

[Synthesia](https://synthesiagame.com/) offers a "Light Guide" feature for some keyboards.
LinnStrument is not directly supported, but with this script it's still possible to have it.

![Synthesia Light Guide](./assets/synthesia-light-guide.png)

### How to use

Setting this up is a big fiddly. This is also in part due to how there are many MIDI ports and loops needed to route MIDI information from and to the right places.

* Checkout / download this repository
* Install https://nodejs.org/en if you haven't it already
* You need to have a virtual MIDI Loop Device (e.g. loopMIDI) where Synthesia sends KeyLights to the Output.
* Configure Synthesia to use it as a MIDI Output device and send "Key Lights" to it, using "Channel 1" mode.
* Set the name of the MIDI output port in the `synthesiaLightGuide.ts` options, or name your virtual device `Loop D`.
    * Have a look at the options if they work for you. It assumes a LinnStrument 128 with default layout
* Start the script:

```sh
npx ts-node src/synthesiaLightGuide.ts
```

### TODO

* Find out starting note and row offset automatically
* Does not support / detect transpose on the fly. 

### Exit User Mode

Sometimes my LinnStrument got stuck in user mode. This scripts puts it out of it.

```sh
node src/exitUserMode.js
```
