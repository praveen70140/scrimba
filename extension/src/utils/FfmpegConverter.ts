import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';

export class FfmpegConverter {
    public static async convertToMp4(webmPath: string, mp4Path: string): Promise<void> {
        if (fs.existsSync(mp4Path)) {
            return; // Already converted
        }

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Converting WebM to MP4 for VS Code compatibility...",
            cancellable: false
        }, async (progress) => {
            return new Promise((resolve, reject) => {
                const ffmpeg = cp.spawn('ffmpeg', [
                    '-y',
                    '-i', webmPath,
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    mp4Path
                ]);

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`ffmpeg exited with code ${code}`));
                    }
                });

                ffmpeg.on('error', (err) => {
                    reject(err);
                });
            });
        });
    }
}
