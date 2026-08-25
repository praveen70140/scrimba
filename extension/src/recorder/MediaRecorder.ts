import * as vscode from 'vscode';

export class MediaRecorder {
  private isRecording = false;
  private startTime = 0;

  public async startRecording(lessonId: string) {
    if (this.isRecording) return;
    
    try {
      // Simulate waiting for OBS IPC acknowledgement
      await this.sendIpcCommand('start', { lessonId });
      
      this.startTime = Date.now();
      this.isRecording = true;
      vscode.window.showInformationMessage('Recording started! OBS is capturing.');
    } catch (e) {
      vscode.window.showErrorMessage('Failed to start recording: OBS plugin not responding.');
    }
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) return;

    try {
      // Simulate waiting for OBS IPC acknowledgement
      await this.sendIpcCommand('stop', {});
      
      this.isRecording = false;
      const stopTime = Date.now();
      vscode.window.showInformationMessage('Recording stopped. Video and timecodes saved by OBS.');
    } catch (e) {
      vscode.window.showErrorMessage('Failed to stop recording: OBS plugin error.');
    }
  }

  private async sendIpcCommand(command: string, payload: any): Promise<void> {
    // Stub: In a real implementation this would use fetch() or a websocket to the OBS plugin
    return new Promise((resolve, reject) => {
      console.log(`[MediaRecorder] Sending OBS IPC command: ${command}`, payload);
      setTimeout(() => resolve(), 500); // Simulate network latency/ack
    });
  }

  public getStartTime(): number {
    return this.startTime;
  }
}
