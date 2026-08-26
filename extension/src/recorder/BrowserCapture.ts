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
    const { x, y } = region;
    // libx264 + yuv420p requires even dimensions
    const width = Math.max(2, Math.floor(region.width / 2) * 2);
    const height = Math.max(2, Math.floor(region.height / 2) * 2);
    const display = process.env.DISPLAY || ':0.0';

    this.ffmpeg.start([
      '-f', 'x11grab',
      '-framerate', '30',
      '-video_size', `${width}x${height}`,
      '-i', `${display}+${x},${y}`,
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
