import * as vscode from 'vscode';
import * as pty from 'node-pty';
import * as os from 'os';

export class TerminalProxy {
  private ptyProcess: pty.IPty;
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  private terminal: vscode.Terminal;

  public onDidWriteCommand = new vscode.EventEmitter<string>();
  public onDidReceiveOutput = new vscode.EventEmitter<string>();

  private outputBuffer: string[] = [];
  private isOpen = false;

  constructor(cwd: string) {
    const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'] || 'bash';
    
    // Spawn a real backend PTY process
    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: cwd,
      env: process.env as any
    });

    this.ptyProcess.onData((data) => {
      if (this.isOpen) {
        this.writeEmitter.fire(data);
        this.onDidReceiveOutput.fire(data);
      } else {
        this.outputBuffer.push(data);
      }
    });

    this.ptyProcess.onExit((e) => {
      this.closeEmitter.fire(e.exitCode);
    });

    // Create the VS Code Pseudoterminal frontend
    const ptyProxy: vscode.Pseudoterminal = {
      onDidWrite: this.writeEmitter.event,
      onDidClose: this.closeEmitter.event,
      open: () => {
        this.isOpen = true;
        // Flush any buffered output that occurred before the terminal frontend was ready
        for (const data of this.outputBuffer) {
          this.writeEmitter.fire(data);
          this.onDidReceiveOutput.fire(data);
        }
        this.outputBuffer = [];
      },
      close: () => {
        this.ptyProcess.kill();
      },
      handleInput: (data: string) => {
        // Input from VS Code UI goes to the backend shell and our capture log
        this.ptyProcess.write(data);
        this.onDidWriteCommand.fire(data);
      }
    };

    this.terminal = vscode.window.createTerminal({
      name: 'Scrim Recorder',
      pty: ptyProxy
    });
  }

  show() {
    this.terminal.show();
  }

  dispose() {
    this.terminal.dispose();
    this.ptyProcess.kill();
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
    this.onDidWriteCommand.dispose();
    this.onDidReceiveOutput.dispose();
  }
}
