import * as path from 'path';
import { FfmpegWrapper } from '../utils/FfmpegWrapper';

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Captures a screen region (e.g. the browser preview webview) to browser-preview.mp4.
 * Uses x11grab on Linux.
 */
export class BrowserCapture {
  private ffmpeg = new FfmpegWrapper();

  public async start(outputDir: string, region: ScreenRegion): Promise<void> {
    const outputPath = path.join(outputDir, 'browser-preview.mp4');
    const { x, y, width, height } = region;

    this.ffmpeg.start([
      '-f', 'x11grab',
      '-framerate', '30',
      '-video_size', `${width}x${height}`,
      '-i', `:0.0+${x},${y}`,
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
