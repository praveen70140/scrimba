import * as path from 'path';
import { FfmpegWrapper } from '../utils/FfmpegWrapper';

/**
 * Captures webcam video to webcam.mp4 using ffmpeg + v4l2.
 */
export class WebcamCapture {
  private ffmpeg = new FfmpegWrapper();

  public async start(outputDir: string, devicePath: string = '/dev/video0'): Promise<void> {
    const outputPath = path.join(outputDir, 'webcam.mp4');

    this.ffmpeg.start([
      '-f', 'v4l2',
      '-framerate', '30',
      '-video_size', '640x480',
      '-i', devicePath,
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
