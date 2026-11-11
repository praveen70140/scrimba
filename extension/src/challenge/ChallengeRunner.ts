import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as util from 'util';

const execFile = util.promisify(childProcess.execFile);

export interface ChallengeResult {
  passed: boolean;
  output: string;
}

export class ChallengeRunner {
  public async runChallenge(testCmd: string, workspacePath: string, timeoutMs = 30000): Promise<ChallengeResult> {
    const command = testCmd.trim();
    if (!command) return { passed: false, output: 'No challenge test command was configured.' };

    let useNix = false;
    try {
      await fs.access(path.join(workspacePath, 'flake.nix'));
      await execFile('nix', ['--version'], { timeout: 5000 });
      useNix = true;
    } catch { /* run the command directly when the workspace or host has no Nix */ }

    try {
      const args = useNix
        ? ['--extra-experimental-features', 'nix-command flakes', 'develop', '--command', 'sh', '-c', command]
        : ['-c', command];
      const executable = useNix ? 'nix' : 'sh';
      const { stdout, stderr } = await execFile(executable, args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      return { passed: true, output: [stdout, stderr].filter(Boolean).join('\n') || 'Passed successfully.' };
    } catch (error: any) {
      return {
        passed: false,
        output: [error?.stdout, error?.stderr, error?.message].filter(Boolean).join('\n') || 'Test failed.',
      };
    }
  }
}
