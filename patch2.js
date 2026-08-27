const fs = require('fs');

// Fix StatusBar.ts
let sb = fs.readFileSync('extension/src/ui/StatusBar.ts', 'utf8');
sb = sb.replace('import { Player } from \'../player/Player\';\n', '');
sb = sb.replace('    private player: Player,\n', '');
fs.writeFileSync('extension/src/ui/StatusBar.ts', sb);

// Fix extension.ts
let ext = fs.readFileSync('extension/src/extension.ts', 'utf8');
ext = ext.replace('const statusBar = new StatusBar(session, null as any, stateManager);', 'const statusBar = new StatusBar(session, stateManager);');
ext = ext.replace('(statusBar as any).player = player;\n', '');

// Add scrim.resume command
const resumeCmd = `
    vscode.commands.registerCommand('scrim.resume', async () => {
      // Resume playback after a fork or challenge
      if (session.playerState === 'FORKED' || session.playerState === 'CHALLENGE') {
        stateManager.transition('PLAYING');
      }
    }),
`;
ext = ext.replace(/(vscode\.commands\.registerCommand\('scrim\.stopRecording')/, resumeCmd + '$1');

fs.writeFileSync('extension/src/extension.ts', ext);
