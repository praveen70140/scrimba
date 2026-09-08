import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ApiClient } from '../api/ApiClient';
import * as http from 'http';
import * as https from 'https';
import { Paths } from '../utils/Paths';

export class Downloader {
  constructor(private apiClient: ApiClient) {}

  /**
   * Fetches presigned download URLs for the lesson, then downloads all 4 assets
   * into the local cache directory `~/.scrimba/cache/<lessonId>/`.
   */
  public async downloadLessonAssets(lessonId: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]+$/.test(lessonId)) {
      throw new Error(`Invalid lessonId: ${lessonId}`);
    }
    const cacheDir = path.join(Paths.getBaseDir(), 'cache', lessonId);
    await fs.mkdir(cacheDir, { recursive: true });

    const urls = await this.apiClient.getDownloadUrls(lessonId);
    
    await Promise.all([
      urls.scrim_url ? this.downloadFile(urls.scrim_url, path.join(cacheDir, 'lesson.scrim')) : Promise.resolve(),
      urls.audio_url ? this.downloadFile(urls.audio_url, path.join(cacheDir, 'audio.ogg')).catch(() => console.log('No audio available')) : Promise.resolve(),
      urls.video_url ? this.downloadFile(urls.video_url, path.join(cacheDir, 'webcam.mp4')).catch(() => console.log('No webcam available')) : Promise.resolve(),
      urls.screen_url ? this.downloadFile(urls.screen_url, path.join(cacheDir, 'screen.mp4')).catch(() => console.log('No screen recording available')) : Promise.resolve()
    ]);

    return cacheDir;
  }

  private downloadFile(urlStr: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const lib = url.protocol === 'https:' ? https : http;
      lib.get(urlStr, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${urlStr}: ${res.statusCode}`));
          return;
        }
        const fileStream = require('fs').createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', (err: any) => {
          require('fs').unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    });
  }
}
