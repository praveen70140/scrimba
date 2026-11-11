import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as util from 'util';

const exec = util.promisify(childProcess.exec);

/** Opens the course workspace terminal and enters its declarative Nix environment. */
export class NixManager {
  private terminal: vscode.Terminal | undefined;

  public async activate(workspacePath: string): Promise<void> {
    this.deactivate();
    this.terminal = vscode.window.createTerminal({
      name: 'Course Environment (Nix)',
      cwd: workspacePath,
    });
    this.terminal.show(true);

    if (!(await this.isNixInstalled())) {
      vscode.window.showWarningMessage("Nix is not installed. The workspace is open at the correct path, but nix --extra-experimental-features 'nix-command flakes' develop cannot start until Nix is installed.");
      return;
    }
    this.terminal.sendText("nix --extra-experimental-features 'nix-command flakes' develop");
  }

  public async isNixInstalled(): Promise<boolean> {
    try {
      await exec('nix --version');
      return true;
    } catch { return false; }
  }

  public deactivate(): void {
    this.terminal?.dispose();
    this.terminal = undefined;
  }
}
