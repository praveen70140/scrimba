const vscode = require('vscode');

exports.activate = function activate(context) {
  const diagnostics = process.env.SCRIMBA_SMOKE_DIAGNOSTICS;
  if (diagnostics) {
    require('fs').writeFileSync(require('path').join(diagnostics, 'extension-activated.txt'), new Date().toISOString());
  }
  const media = vscode.Uri.joinPath(context.extensionUri, 'media');
  const panel = vscode.window.createWebviewPanel(
    'scrimba.fullscreenSmoke', 'Fullscreen smoke test', vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] }
  );
  context.subscriptions.push(panel);
  const sources = Object.fromEntries(['mp4', 'webm'].map(format => [
    format, panel.webview.asWebviewUri(vscode.Uri.joinPath(media, `sample.${format}`)).toString(),
  ]));
  panel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${panel.webview.cspSource}; script-src 'nonce-fullscreen-smoke'; style-src 'unsafe-inline';">
<style>video { width: 320px; height: 180px; } video:fullscreen { width: 100%; height: 100%; object-fit: contain; background: black; }</style>
</head><body>
<video id="fullscreen-video" muted loop playsinline controls></video>
<button id="play-mp4">Play H.264 MP4</button>
<button id="play-webm">Play VP9 WebM</button>
<button id="enter-fullscreen">Fullscreen video</button>
<p id="result">Ready</p>
<script nonce="fullscreen-smoke">
const video = document.getElementById('fullscreen-video');
const result = document.getElementById('result');
const sources = ${JSON.stringify(sources)};
window.mediaSupport = {
  h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
  vp9: video.canPlayType('video/webm; codecs="vp9"'),
};
video.addEventListener('error', () => {
  result.textContent = 'media error: ' + video.error?.code + ' ' + video.error?.message;
});
for (const format of ['mp4', 'webm']) {
  document.getElementById('play-' + format).addEventListener('click', async () => {
    video.src = sources[format];
    try {
      await video.play();
      result.textContent = 'playing ' + format;
    } catch (error) { result.textContent = 'playback error: ' + error.message; }
  });
}
document.getElementById('enter-fullscreen').addEventListener('click', async () => {
  try {
    await video.requestFullscreen();
    result.textContent = 'fullscreen';
  } catch (error) { result.textContent = 'fullscreen error: ' + error.message; }
});
</script></body></html>`;
};
