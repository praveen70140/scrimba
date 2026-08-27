const { StateHydrator } = require('./extension/out/player/StateHydrator.js');

const initialFiles = {
  "index.js": "console.log('starter');"
};
const events = [
  { t: 5000, type: 'edit', path: "index.js", range: [[0, 20], [0, 20]], text: " // edit 1" }
];

console.log("Hydrate with relative target:");
console.log(StateHydrator.hydrate(initialFiles, events, 5000));

console.log("Hydrate with absolute target:");
console.log(StateHydrator.hydrate(initialFiles, events, 1787000005000));
