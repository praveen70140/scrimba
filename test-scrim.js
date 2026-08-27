const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
const unzipped = zlib.gunzipSync(buf);
console.log(JSON.stringify(JSON.parse(unzipped.toString()), null, 2));
