rm -rf ./web/lib
mkdir ./web/lib

cat node_modules/bootstrap/dist/css/bootstrap.min.css >> ./web/lib/bootstrap.min.css
cat node_modules/bootstrap/dist/css/bootstrap.min.css.map >> ./web/lib/bootstrap.min.css.map
cat node_modules/bootstrap/dist/js/bootstrap.bundle.min.js >> ./web/lib/bootstrap.bundle.min.js

cat node_modules/webmidi/dist/iife/webmidi.iife.min.js >> ./web/lib/webmidi.iife.min.js
cat node_modules/jzz/javascript/JZZ.js >> ./web/lib/JZZ.js
cat node_modules/jzz-midi-smf/javascript/JZZ.midi.SMF.js >> ./web/lib/JZZ.midi.SMF.js
