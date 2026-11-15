// Exercise the actual CLI callback without compiling VS Code or Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('\n\t\tif (args.verbose || args.status ||');
const end = source.indexOf('\n\t\t// Handle --transient option', start);
assert.ok(start >= 0 && end > start, 'Could not locate CLI lifetime callback');
const code = source.slice(start, end).replaceAll('data: Buffer', 'data');

async function exercise(args, appimage, expected) {
  const callbacks = [];
  vm.runInNewContext(code, {
    args, env: { SCRIMBA_APPIMAGE: appimage }, processCallbacks: callbacks, console,
    Event: {
      fromNodeEventEmitter: (emitter, name) => ({ emitter, name }),
      toPromise: ({ emitter, name }) => new Promise(resolve => emitter.once(name, resolve)),
    },
  });
  assert.equal(callbacks.length, expected ? 1 : 0);
  if (!expected) return;
  const child = new EventEmitter();
  let finished = false;
  const waiting = callbacks[0](child).then(() => { finished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false, 'AppImage must stay mounted while the editor runs');
  child.emit('exit', 0);
  await waiting;
  assert.equal(finished, true, 'Launcher must finish after editor exit');
}

(async () => {
  await exercise({}, '1', true);
  await exercise({ wait: true }, '1', true);
  await exercise({}, undefined, false);
  await exercise({}, '0', false);
  await exercise({ verbose: true }, undefined, true);
  await exercise({ status: true }, undefined, true);
  console.log('PASS: AppImage waits for editor exit without verbose; normal CLI behavior preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
