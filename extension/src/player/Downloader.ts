import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as http from 'http';
import * as https from 'https';
import { ApiClient } from '../api/ApiClient';
import { Paths } from '../utils/Paths';

export class Downloader {
  constructor(private apiClient: ApiClient) {}

  public async downloadLessonAssets(lessonId: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]+$/.test(lessonId)) throw new Error(`Invalid lessonId: ${lessonId}`);
    const cacheDir = path.join(Paths.getBaseDir(), 'cache', lessonId);
    await fs.mkdir(cacheDir, { recursive: true });
    const urls = await this.apiClient.getDownloadUrls(lessonId);
    if (!urls.scrim_url) throw new Error('This lesson has no recording yet.');

    await Promise.all([
      this.downloadFile(urls.scrim_url, path.join(cacheDir, 'lesson.scrim')),
      urls.audio_url ? this.downloadFile(urls.audio_url, path.join(cacheDir, 'audio.ogg')).catch(() => undefined) : Promise.resolve(),
      urls.video_url ? this.downloadFile(urls.video_url, path.join(cacheDir, 'webcam.mp4')).catch(() => undefined) : Promise.resolve(),
      urls.screen_url ? this.downloadFile(urls.screen_url, path.join(cacheDir, 'screen.mp4')).catch(() => undefined) : Promise.resolve(),
    ]);
    return cacheDir;
  }

  private downloadFile(urlStr: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try { parsed = new URL(urlStr); } catch { reject(new Error('Invalid download URL')); return; }
      const lib = parsed.protocol === 'https:' ? https : parsed.protocol === 'http:' ? http : undefined;
      if (!lib) { reject(new Error(`Unsupported download protocol: ${parsed.protocol}`)); return; }

      const request = lib.get(parsed, { timeout: 60000 }, response => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to download asset: HTTP ${response.statusCode}`));
          return;
        }
        const stream = fsSync.createWriteStream(destPath);
        response.pipe(stream);
        const fail = (error: Error) => {
          stream.destroy();
          void fs.unlink(destPath).catch(() => undefined);
          reject(error);
        };
        response.once('error', fail);
        stream.once('error', fail);
        stream.once('finish', () => { stream.close(); resolve(); });
      });
      request.once('timeout', () => request.destroy(new Error('Asset download timed out')));
      request.once('error', error => {
        void fs.unlink(destPath).catch(() => undefined);
        reject(error);
      });
    });
  }
}
