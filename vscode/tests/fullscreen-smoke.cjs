// Run only in CI, against the packaged application and its own prebuilt Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This smoke test belongs in GitHub Actions');
  const root = path.resolve(__dirname, '..');
  const requireUpstream = createRequire(path.join(root, 'source', 'package.json'));
  const { _electron } = requireUpstream('playwright');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-fullscreen-'));
  let app;
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({
      executablePath: path.join(root, 'VSCode-linux-x64', 'code-oss'),
      args: [
        '--no-sandbox', '--disable-gpu', '--disable-workspace-trust',
        '--skip-welcome', '--skip-release-notes',
        '--user-data-dir', path.join(temp, 'user'),
        '--extensions-dir', path.join(temp, 'extensions'),
        '--extensionDevelopmentPath=' + path.join(__dirname, 'fullscreen-extension'),
      ],
      env,
      timeout: 120_000,
    });
    const log = [];
    app.process().stdout?.on('data', chunk => log.push(chunk.toString()));
    app.process().stderr?.on('data', chunk => log.push(chunk.toString()));
    const window = await app.firstWindow({ timeout: 120_000 });
    let videoFrame;
    const deadline = Date.now() + 120_000;
    while (!videoFrame && Date.now() < deadline) {
      for (const frame of window.frames()) {
        try {
          if (await frame.locator('#fullscreen-video').count()) {
            videoFrame = frame;
            break;
          }
        } catch { /* A pending webview frame may be replaced while loading. */ }
      }
      if (!videoFrame) await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(videoFrame, 'The smoke-test extension did not open its video webview:\n' + log.join(''));
    let nesting = 0;
    for (let frame = videoFrame; frame.parentFrame(); frame = frame.parentFrame()) nesting++;
    assert.ok(nesting >= 2, 'The test must exercise both nested webview iframes');
    await videoFrame.waitForFunction(() => {
      const video = document.getElementById('fullscreen-video');
      return video.readyState >= 2 && video.currentTime > 0 && !video.paused;
    }, null, { timeout: 30_000 });
    assert.equal(await videoFrame.evaluate(() => document.fullscreenEnabled), true);
    // A real click supplies transient user activation; script-only calls are invalid tests.
    await videoFrame.locator('#enter-fullscreen').click();
    try {
      await videoFrame.waitForFunction(() => document.fullscreenElement === document.getElementById('fullscreen-video'), null, { timeout: 15_000 });
      assert.equal(await window.evaluate(() => !!document.fullscreenElement), true,
        'Fullscreen must propagate through the workbench frame');
      await window.keyboard.press('Escape');
      await videoFrame.waitForFunction(() => !document.fullscreenElement, null, { timeout: 15_000 });
      assert.equal(await window.evaluate(() => !!document.fullscreenElement), false);
    } catch (error) {
      throw new Error(`${error.message}\nWebview: ${await videoFrame.locator('#result').textContent()}\n${log.join('')}`);
    }
    console.log('PASS: video plays, enters fullscreen through both iframes, and exits with Escape');
  } finally {
    if (app) await app.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
