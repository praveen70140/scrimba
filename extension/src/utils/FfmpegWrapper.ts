import { ChildProcess, spawn } from 'child_process';

export interface FfmpegDevice {
  name: string;
  path: string;
}

/**
 * Typed wrapper around the ffmpeg child process.
 * All capture classes use this to spawn and manage ffmpeg.
 */
export class FfmpegWrapper {
  private process: ChildProcess | null = null;
  private outputPath: string = '';

  /**
   * Detects available audio input devices on Linux (using arecord -l)
   */
  public static async detectAudioDevices(): Promise<FfmpegDevice[]> {
    return new Promise((resolve) => {
      const proc = spawn('arecord', ['-l']);
      let out = '';
      proc.stdout?.on('data', (d) => { out += d; });
      proc.stderr?.on('data', (d) => { out += d; });
      proc.on('close', () => {
        const devices: FfmpegDevice[] = [];
        // Parse "card N: Name [Name], device N:"
        const re = /card (\d+):\s+(\S+)/g;
        let m;
        while ((m = re.exec(out)) !== null) {
          devices.push({ name: m[2], path: `hw:${m[1]},0` });
        }
        resolve(devices.length > 0 ? devices : [{ name: 'default', path: 'default' }]);
      });
      proc.on('error', () => resolve([{ name: 'default', path: 'default' }]));
    });
  }

  /**
   * Detects available video (webcam) devices on Linux (v4l2)
   */
  public static async detectVideoDevices(): Promise<FfmpegDevice[]> {
    return new Promise((resolve) => {
      const proc = spawn('v4l2-ctl', ['--list-devices']);
      let out = '';
      proc.stdout?.on('data', (d) => { out += d; });
      proc.stderr?.on('data', (d) => { out += d; });
      proc.on('close', () => {
        const devices: FfmpegDevice[] = [];
        const lines = out.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const devPath = lines[i].trim();
          if (devPath.startsWith('/dev/video')) {
            const name = lines[i - 1]?.trim() || devPath;
            devices.push({ name, path: devPath });
          }
        }
        resolve(devices.length > 0 ? devices : [{ name: '/dev/video0', path: '/dev/video0' }]);
      });
      proc.on('error', () => resolve([{ name: '/dev/video0', path: '/dev/video0' }]));
    });
  }

  /**
   * Starts an ffmpeg recording with the given arguments.
   * @param args  ffmpeg CLI arguments (excluding the ffmpeg binary itself)
   * @param outputPath  the destination file (for tracking)
   */
  public start(args: string[], outputPath: string): void {
    if (this.process) {
      throw new Error('FfmpegWrapper: already recording');
    }
    this.outputPath = outputPath;
    this.process = spawn('ffmpeg', ['-y', ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.on('error', (err) => {
      console.error(`[FfmpegWrapper] process error for ${outputPath}:`, err);
      this.process = null;
    });

    this.process.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[FfmpegWrapper] ffmpeg exited with code ${code} for ${outputPath}`);
      }
      this.process = null;
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      // ffmpeg writes progress to stderr — log at trace level only
      console.debug(`[ffmpeg] ${data.toString().trim()}`);
    });
  }

  /**
   * Stops the ffmpeg process by sending 'q' (graceful quit).
   * Returns a promise that resolves when the process exits.
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      const proc = this.process;
      if (!proc) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.process = null;
        resolve();
      };
      proc.once('close', finish);
      // Send 'q' to ffmpeg stdin triggers graceful finalization
      proc.stdin?.write('q');
      proc.stdin?.end();

      // Force kill after 5s if it doesn't exit gracefully
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        finish();
      }, 5000);
    });
  }

  public get isRunning(): boolean {
    return this.process !== null;
  }

  public getOutputPath(): string {
    return this.outputPath;
  }
}
