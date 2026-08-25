import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as util from 'util';

const exec = util.promisify(child_process.exec);

export class NixManager {
  private terminal: vscode.Terminal | undefined;

  /**
   * Activates the Nix environment in a VS Code terminal for the student to use
   */
  public activate(workspacePath: string) {
    if (this.terminal) {
      this.terminal.dispose();
    }

    this.terminal = vscode.window.createTerminal({
      name: 'Course Environment (Nix)',
      cwd: workspacePath,
    });

    this.terminal.show();
    this.terminal.sendText('nix develop');
  }

  /**
   * Checks if Nix is installed on the host machine
   */
  public async isNixInstalled(): Promise<boolean> {
    try {
      await exec('nix --version');
      return true;
    } catch {
      return false;
    }
  }

  public deactivate() {
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = undefined;
    }
  }
}
