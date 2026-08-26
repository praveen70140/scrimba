import * as path from 'path';
import { FfmpegWrapper } from '../utils/FfmpegWrapper';

/**
 * Captures microphone audio to an .ogg file using ffmpeg.
 * Uses ALSA (Linux) — 'default' device unless overridden.
 */
export class AudioCapture {
  private ffmpeg = new FfmpegWrapper();

  public async start(outputDir: string, devicePath: string = 'default'): Promise<void> {
    const outputPath = path.join(outputDir, 'audio.ogg');

    this.ffmpeg.start([
      '-f', 'alsa',
      '-i', devicePath,
      '-c:a', 'libopus',
      '-b:a', '128k',
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
