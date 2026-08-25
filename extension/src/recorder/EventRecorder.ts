import { ScrimEvent } from '@scrimba-clone/shared';

export class EventRecorder {
  private events: ScrimEvent[] = [];
  private startTimeMs: number = 0;
  private isRecording = false;

  public start() {
    this.events = [];
    this.startTimeMs = Date.now();
    this.isRecording = true;
  }

  public stop(): ScrimEvent[] {
    this.isRecording = false;
    return this.events;
  }

  public pushEvent(eventFactory: (relativeTimeMs: number) => ScrimEvent) {
    if (!this.isRecording) return;
    
    // Calculate precise time relative to the start of the recording
    const relativeTimeMs = Date.now() - this.startTimeMs;
    this.events.push(eventFactory(relativeTimeMs));
  }

  public getEvents(): ScrimEvent[] {
    return this.events;
  }
}
