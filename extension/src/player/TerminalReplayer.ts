import * as vscode from 'vscode';

/**
 * Replays terminal events during playback.
 * It uses a Pseudoterminal to create a readonly VS Code terminal that we write to.
 */
export class TerminalReplayer implements vscode.Disposable {
  private writeEmitter = new vscode.EventEmitter<string>();
  private pty: vscode.Pseudoterminal;
  private terminal: vscode.Terminal | null = null;
  private outputBuffer: string[] = [];
  private isOpen = false;

  constructor() {
    this.pty = {
      onDidWrite: this.writeEmitter.event,
      open: () => {
        this.isOpen = true;
        // Flush buffer
        for (const data of this.outputBuffer) {
          this.writeEmitter.fire(data);
        }
        this.outputBuffer = [];
      },
      close: () => {
        this.isOpen = false;
      },
      handleInput: (data: string) => {
        // Readonly: ignore user input during playback
      }
    };
  }

  public show(): void {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal({ name: 'Scrim Playback', pty: this.pty });
    }
    this.terminal.show(true); // true = preserve focus (don't steal focus from editor)
  }

  public hide(): void {
    this.terminal?.hide();
  }

  public write(data: string): void {
    // Normalize newlines for xterm.js
    const normalized = data.replace(/\r?\n/g, '\r\n');
    if (this.isOpen) {
      this.writeEmitter.fire(normalized);
    } else {
      this.outputBuffer.push(normalized);
    }
  }

  public clear(): void {
    // ANSI escape code to clear terminal screen
    this.write('\x1b[2J\x1b[H');
    this.outputBuffer = [];
  }

  public dispose(): void {
    this.terminal?.dispose();
    this.writeEmitter.dispose();
  }
}
