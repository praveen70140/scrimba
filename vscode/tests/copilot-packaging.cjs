// Exercise the actual patched task body without importing/building VS Code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const text = fs.readFileSync(process.argv[2], 'utf8');
const start = text.indexOf('function prepareCopilotRipgrepShimTask(');
const end = text.indexOf('\nfunction generateNodeCompileCacheTask(', start);
assert.ok(start >= 0 && end > start, 'Could not locate upstream packaging task');
const task = text.slice(start, end)
  .replace('platform: string, arch: string, destinationFolderName: string', 'platform, arch, destinationFolderName')
  .replace('commit!', 'commit');

async function exercise(present, fail) {
  let calls = 0;
  let checked;
  const run = vm.runInNewContext(task + '\nprepareCopilotRipgrepShimTask', {
    path, root: '/checkout/vscode/source', product: {}, commit: 'test',
    util: { getVersionedResourcesFolder: () => '' },
    fs: { existsSync: directory => { checked = directory; return present; } },
    prepareBuiltInCopilotRipgrepShim: (platform, arch, directory, appNodeModules) => {
      calls++;
      assert.equal(platform, 'linux');
      assert.equal(arch, 'x64');
      assert.equal(directory, '/checkout/vscode/VSCode-linux-x64/resources/app/extensions/copilot');
      assert.equal(appNodeModules, '/checkout/vscode/VSCode-linux-x64/resources/app/node_modules.asar.unpacked');
      if (fail) throw new Error('Incomplete Copilot SDK');
    },
  });
  const result = run('linux', 'x64', 'VSCode-linux-x64')();
  if (fail) await assert.rejects(result, /Incomplete Copilot SDK/);
  else await result;
  assert.equal(checked, '/checkout/vscode/VSCode-linux-x64/resources/app/extensions/copilot');
  assert.equal(calls, present ? 1 : 0);
}

(async () => {
  await exercise(false, false);
  await exercise(true, false);
  await exercise(true, true);
  console.log('PASS: absent Copilot is skipped; present Copilot is prepared; malformed SDK still fails');
})().catch(error => { console.error(error); process.exitCode = 1; });
