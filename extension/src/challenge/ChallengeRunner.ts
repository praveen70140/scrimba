import * as child_process from 'child_process';
import * as util from 'util';

const execFile = util.promisify(child_process.execFile);

export interface ChallengeResult {
  passed: boolean;
  output: string;
}

export class ChallengeRunner {
  /**
   * Executes a challenge test command in the student's physical fork directory
   * using child_process.execFile to properly wrap the command in nix develop.
   * Relies on VS Code's standard Workspace Trust model for security.
   */
  public async runChallenge(testCmd: string, forkPath: string, timeoutMs: number = 30000): Promise<ChallengeResult> {
    try {
      // Execute the test command inside the fork folder using nix develop
      const { stdout, stderr } = await execFile('nix', ['develop', '--command', 'sh', '-c', testCmd], {
        cwd: forkPath,
        timeout: timeoutMs,
      });

      return {
        passed: true,
        output: [stdout, stderr].filter(Boolean).join('\n') || 'Passed successfully.',
      };
    } catch (error: any) {
      // Combine both streams before falling back to error message
      const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n') || 'Test failed.';
      
      return {
        passed: false,
        output,
      };
    }
  }
}
