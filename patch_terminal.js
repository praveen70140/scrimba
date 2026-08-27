const fs = require('fs');
let ev = fs.readFileSync('extension/src/recorder/EventCapture.ts', 'utf8');

const newCode = `
    // ── Terminal events ──────────────────────────────────────────────────────
    if ((vscode.window as any).onDidWriteTerminalData) {
      this.disposables.push(
        (vscode.window as any).onDidWriteTerminalData((e: any) => {
          this.session.recordedEvents.push({
            t: this.elapsed,
            type: 'terminal_out',
            text: e.data,
          });
        })
      );
    }
    
    // We can also track when terminal shell execution starts as a command
    if ((vscode.window as any).onDidStartTerminalShellExecution) {
      this.disposables.push(
        (vscode.window as any).onDidStartTerminalShellExecution((e: any) => {
          this.session.recordedEvents.push({
            t: this.elapsed,
            type: 'terminal_cmd',
            text: e.execution?.commandLine?.value || 'unknown command',
          });
        })
      );
    }
`;

ev = ev.replace('public start(context: vscode.ExtensionContext): void {', 'public start(context: vscode.ExtensionContext): void {\n' + newCode);
fs.writeFileSync('extension/src/recorder/EventCapture.ts', ev);
