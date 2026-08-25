import { ScrimEvent } from '@scrimba-clone/shared';
import { EditorApplicator } from './EditorApplicator';

export class EventReplayer {
  private events: ScrimEvent[] = [];
  private currentIndex = 0;
  private isSyncing = false;
  
  constructor(private applicator: EditorApplicator) {}

  public loadEvents(events: ScrimEvent[]) {
    this.events = events.sort((a, b) => a.t - b.t);
    this.currentIndex = 0;
  }

  public async syncToTimestamp(absoluteTimeMs: number, resetFromZero = false) {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      if (resetFromZero) {
        this.currentIndex = 0;
      }

      while (this.currentIndex < this.events.length) {
        const event = this.events[this.currentIndex];
        
        if (event.t <= absoluteTimeMs) {
          await this.applicator.applyEvent(event);
          this.currentIndex++;
        } else {
          break;
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }
}
