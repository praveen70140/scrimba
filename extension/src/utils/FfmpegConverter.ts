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
                const tmpPath = `${mp4Path}.tmp.mp4`;
                let stderr = '';
                const ffmpeg = cp.spawn('ffmpeg', [
                    '-y',
                    '-i', webmPath,
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    tmpPath
                ]);

                ffmpeg.stderr?.on('data', d => { stderr += d.toString(); });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        fs.renameSync(tmpPath, mp4Path);
                        resolve();
                    } else {
                        fs.rmSync(tmpPath, { force: true });
                        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
                    }
                });

                ffmpeg.on('error', (err) => {
                    fs.rmSync(tmpPath, { force: true });
                    reject(err);
                });
            });
        });
    }

    public static startBackgroundTranscode(webmPath: string, mp4Path: string): Promise<void> {
        if (fs.existsSync(mp4Path)) {
            return Promise.resolve(); // Already converted
        }

        return new Promise((resolve, reject) => {
            const tmpPath = `${mp4Path}.tmp.mp4`;
            let stderr = '';
            const ffmpeg = cp.spawn('ffmpeg', [
                '-y',
                '-i', webmPath,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'fast',
                tmpPath
            ]);

            ffmpeg.stderr?.on('data', d => { stderr += d.toString(); });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    try {
                        fs.renameSync(tmpPath, mp4Path);
                    } catch (err) {
                        fs.rmSync(tmpPath, { force: true });
                        reject(err);
                        return;
                    }
                    console.log(`[FfmpegConverter] Background transcode complete: ${mp4Path}`);
                    resolve();
                } else {
                    fs.rmSync(tmpPath, { force: true });
                    console.error(`[FfmpegConverter] Background transcode failed: code ${code}, ${stderr.slice(-500)}`);
                    reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
                }
            });

            ffmpeg.on('error', (err) => {
                fs.rmSync(tmpPath, { force: true });
                console.error(`[FfmpegConverter] Background transcode error: ${err.message}`);
                reject(err);
            });
        });
    }
}
