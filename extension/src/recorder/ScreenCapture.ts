import * as path from 'path';
import { FfmpegWrapper } from '../utils/FfmpegWrapper';

/**
 * Captures the entire screen to screen.mp4.
 * Uses x11grab on Linux.
 */
export class ScreenCapture {
  private ffmpeg = new FfmpegWrapper();

  public async start(outputDir: string): Promise<void> {
    const outputPath = path.join(outputDir, 'screen.mp4');
    const display = process.env.DISPLAY || ':0.0';

    this.ffmpeg.start([
      '-f', 'x11grab',
      '-framerate', '30',
      // By not specifying video_size, it captures the whole screen
      '-i', display,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      outputPath
    ], outputPath);
  }

  public async stop(): Promise<void> {
    await this.ffmpeg.stop();
  }

  public get isRecording(): boolean {
    return this.ffmpeg.isRunning;
  }
}
