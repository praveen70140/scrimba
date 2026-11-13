const vscode = require('vscode');

exports.activate = function activate(context) {
  const diagnostics = process.env.SCRIMBA_SMOKE_DIAGNOSTICS;
  if (diagnostics) {
    require('fs').writeFileSync(require('path').join(diagnostics, 'extension-activated.txt'), new Date().toISOString());
  }
  const panel = vscode.window.createWebviewPanel(
    'scrimba.fullscreenSmoke', 'Fullscreen smoke test', vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  context.subscriptions.push(panel);
  panel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src blob:; script-src 'nonce-fullscreen-smoke'; style-src 'unsafe-inline';">
<style>video { width: 320px; height: 180px; } video:fullscreen { width: 100%; height: 100%; object-fit: contain; background: black; }</style>
</head><body>
<video id="fullscreen-video" muted autoplay playsinline controls></video>
<button id="enter-fullscreen">Fullscreen video</button>
<p id="result">Starting video</p>
<script nonce="fullscreen-smoke">
const video = document.getElementById('fullscreen-video');
const result = document.getElementById('result');
const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 180;
const ctx = canvas.getContext('2d');
function draw(time) {
  ctx.fillStyle = 'rgb(' + (Math.floor(time / 20) % 255) + ', 60, 120)';
  ctx.fillRect(0, 0, 320, 180);
  ctx.fillStyle = 'white';
  ctx.fillText('Scrimba fullscreen ' + Math.floor(time), 25, 90);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
video.srcObject = canvas.captureStream(15);
video.play().then(() => { result.textContent = 'playing'; }).catch(error => {
  result.textContent = 'playback error: ' + error.message;
});
document.getElementById('enter-fullscreen').addEventListener('click', async () => {
  try {
    await video.requestFullscreen();
    result.textContent = 'fullscreen';
  } catch (error) {
    result.textContent = 'fullscreen error: ' + error.message;
  }
});
</script></body></html>`;
};
