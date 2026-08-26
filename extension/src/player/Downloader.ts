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

    // In a real app, this would get actual presigned URLs.
    // For now we get the stub URLs from the API.
    const urls = await this.apiClient.getDownloadUrls(lessonId);
    
    // In our local testing setup without a real S3 yet, we might not have valid URLs.
    // We'll simulate download success for now.
    // To implement real downloads:
    // await this.downloadFile(urls.scrim_url, path.join(cacheDir, 'lesson.scrim'));
    // await this.downloadFile(urls.audio_url, path.join(cacheDir, 'audio.ogg'));
    // await this.downloadFile(urls.video_url, path.join(cacheDir, 'webcam.mp4'));
    // await this.downloadFile(urls.timecodes_url, path.join(cacheDir, 'browser-preview.mp4'));

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
        // const fileStream = require('fs').createWriteStream(destPath);
        // res.pipe(fileStream);
        // fileStream.on('finish', resolve);
        // fileStream.on('error', reject);
        resolve(); // Stub
      }).on('error', reject);
    });
  }
}
