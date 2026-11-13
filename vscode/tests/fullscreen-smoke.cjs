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
  const diagnostics = path.join(root, 'verification');
  await fs.mkdir(diagnostics, { recursive: true });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'scrimba-fullscreen-'));
  const userData = path.join(temp, 'user');
  const workspace = path.join(temp, 'workspace');
  await fs.mkdir(path.join(userData, 'User'), { recursive: true });
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(userData, 'User', 'settings.json'), JSON.stringify({
    'workbench.startupEditor': 'none',
    'window.restoreWindows': 'none',
    'security.workspace.trust.enabled': false,
    'telemetry.telemetryLevel': 'off',
    'chat.disableAIFeatures': true,
  }));
  let app;
  let stage = 'launch';
  const log = [];
  let failure;
  try {
    const env = { ...process.env, SCRIMBA_SMOKE_DIAGNOSTICS: diagnostics };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({
      executablePath: path.join(root, 'VSCode-linux-x64', 'scrimba'),
      args: [
        '--no-sandbox', '--disable-gpu', '--disable-workspace-trust',
        '--new-window', '--skip-welcome', '--skip-release-notes', '--log=trace',
        '--user-data-dir', userData,
        '--extensions-dir', path.join(temp, 'extensions'),
        '--extensionDevelopmentPath=' + path.join(__dirname, 'fullscreen-extension'),
        workspace,
      ],
      env,
      timeout: 90_000,
    });
    app.process().stdout?.on('data', chunk => log.push(chunk.toString()));
    app.process().stderr?.on('data', chunk => log.push(chunk.toString()));
    await app.firstWindow({ timeout: 60_000 });
    stage = 'find video webview';
    let videoFrame;
    let window;
    const deadline = Date.now() + 90_000;
    while (!videoFrame && Date.now() < deadline) {
      // Startup may create more than one window. Inspect all workbench windows.
      for (const candidate of app.windows()) {
        for (const frame of candidate.frames()) {
          try {
            if (await frame.locator('#fullscreen-video').count()) {
              videoFrame = frame;
              window = candidate;
              break;
            }
          } catch { /* A pending webview frame may be replaced while loading. */ }
        }
        if (videoFrame) break;
      }
      if (!videoFrame) await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(videoFrame, 'The smoke-test extension did not open its video webview:\n' + log.join(''));
    let nesting = 0;
    for (let frame = videoFrame; frame.parentFrame(); frame = frame.parentFrame()) nesting++;
    assert.ok(nesting >= 2, 'The test must exercise both nested webview iframes');
    stage = 'video playback';
    await videoFrame.waitForFunction(() => {
      const video = document.getElementById('fullscreen-video');
      return video.readyState >= 2 && video.currentTime > 0 && !video.paused;
    }, null, { timeout: 20_000 });
    assert.equal(await videoFrame.evaluate(() => document.fullscreenEnabled), true);
    stage = 'enter fullscreen';
    await videoFrame.locator('#enter-fullscreen').click({ timeout: 10_000 });
    try {
      await videoFrame.waitForFunction(() => document.fullscreenElement === document.getElementById('fullscreen-video'), null, { timeout: 10_000 });
      assert.equal(await window.evaluate(() => !!document.fullscreenElement), true,
        'Fullscreen must propagate through the workbench frame');
      stage = 'exit fullscreen';
      await window.keyboard.press('Escape');
      await videoFrame.waitForFunction(() => !document.fullscreenElement, null, { timeout: 10_000 });
      assert.equal(await window.evaluate(() => !!document.fullscreenElement), false);
    } catch (error) {
      throw new Error(`${error.message}\nWebview: ${await videoFrame.locator('#result').textContent()}\n${log.join('')}`);
    }
    stage = 'complete';
    console.log('PASS: video plays, enters fullscreen through both iframes, and exits with Escape');
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // Preserve startup, extension-host, frame and renderer diagnostics on failure.
    await fs.writeFile(path.join(diagnostics, 'result.json'), JSON.stringify({
      status: failure ? 'failure' : 'success', stage, error: failure?.stack,
    }, null, 2));
    await fs.writeFile(path.join(diagnostics, 'application.log'), log.join(''));
    if (app) {
      const windows = [];
      for (const [index, window] of app.windows().entries()) {
        const details = { url: window.url(), frames: window.frames().map(frame => frame.url()) };
        try {
          details.title = await window.title();
          await window.screenshot({ path: path.join(diagnostics, `window-${index}.png`), timeout: 5000 });
          await fs.writeFile(path.join(diagnostics, `window-${index}.html`), await window.content());
        } catch (error) { details.captureError = error.message; }
        windows.push(details);
      }
      await fs.writeFile(path.join(diagnostics, 'windows.json'), JSON.stringify(windows, null, 2));
      try { await app.close(); } catch { app.process().kill('SIGKILL'); }
    }
    try { await fs.cp(path.join(userData, 'logs'), path.join(diagnostics, 'editor-logs'), { recursive: true }); }
    catch (error) { console.error('Could not copy editor logs:', error.message); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
