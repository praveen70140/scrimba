import { ScrimEvent } from '@scrimba-clone/shared';

export class StateHydrator {
  /**
   * Hydrates the state of the workspace files at a specific timestamp.
   * @param initialFiles Record of file paths to their string contents at t=0
   * @param events Array of all ScrimEvents
   * @param targetTimeMs The timestamp to reconstruct the state up to
   * @returns A new Record of file paths to their hydrated string contents
   */
  public static hydrate(
    initialFiles: Record<string, string>,
    events: ScrimEvent[],
    targetTimeMs: number
  ): Record<string, string> {
    // Clone the initial state
    const files: Record<string, string> = { ...initialFiles };

    console.log(`[StateHydrator] hydrate called: targetTimeMs=${targetTimeMs}, events=${events.length}, initialFiles=${Object.keys(initialFiles).join(', ') || 'NONE'}`);

    // 1. Find the offset for buggy absolute events
    let timeOffset = 0;
    for (const event of events) {
      if (event.t > 1000000000000) {
        timeOffset = event.t;
        break;
      }
    }

    for (const event of events) {
      const isEventAbsolute = event.t > 1000000000000;
      let adjustedT = event.t;
      if (isEventAbsolute && timeOffset > 0) {
        adjustedT = event.t - timeOffset;
      }

      if (adjustedT > targetTimeMs) {
        console.log(`[StateHydrator] SKIP event t=${event.t} (adjustedT=${adjustedT} > targetTimeMs=${targetTimeMs}) type=${event.type}`);
        continue; // Don't break, just skip, in case events are slightly out of order due to mixed timestamps
      }
      console.log(`[StateHydrator] APPLY event t=${event.t} (adjustedT=${adjustedT}) type=${event.type} path=${(event as any).path || ''}`);

      switch (event.type) {
        case 'file_create': {
          const path = this.cleanPath(event.path);
          if (!event.is_dir) {
            if (files[path] === undefined) {
              files[path] = event.content ?? '';
            }
          }
          break;
        }
        case 'file_delete': {
          const path = this.cleanPath(event.path);
          // Delete file or directory (prefix match)
          const toDelete = Object.keys(files).filter(k => k === path || k.startsWith(path + '/'));
          for (const key of toDelete) {
            delete files[key];
          }
          break;
        }
        case 'file_rename': {
          const oldPath = this.cleanPath(event.old_path);
          const newPath = this.cleanPath(event.new_path);
          const toRename = Object.keys(files).filter(k => k === oldPath || k.startsWith(oldPath + '/'));
          for (const key of toRename) {
            const content = files[key];
            delete files[key];
            const updatedKey = key === oldPath ? newPath : newPath + key.substring(oldPath.length);
            files[updatedKey] = content;
          }
          break;
        }
        case 'edit': {
          const path = this.cleanPath(event.path);
          let fileContent = files[path];
          if (fileContent === undefined) {
            fileContent = '';
            files[path] = '';
          }

          const lines = fileContent.split('\n');
          const [startLine, startCol] = event.range[0];
          const [endLine, endCol] = event.range[1];

          // Robust fallback: if edit is out of bounds (e.g. missing initial state), pad with newlines
          while (lines.length <= Math.max(startLine, endLine)) {
            lines.push('');
          }
          
          if (startCol < 0 || endCol < 0) continue;
          
          // Pad the specific line with spaces if the column is out of bounds
          if (startCol > lines[startLine].length) {
            lines[startLine] = lines[startLine].padEnd(startCol, ' ');
          }
          if (endCol > lines[endLine].length) {
            lines[endLine] = lines[endLine].padEnd(endCol, ' ');
          }

          if (startLine > endLine || (startLine === endLine && startCol > endCol)) continue;

          const beforeEdit = lines.slice(0, startLine).join('\n') + (startLine > 0 ? '\n' : '') + lines[startLine].substring(0, startCol);
          const afterEdit = lines[endLine].substring(endCol) + (endLine < lines.length - 1 ? '\n' : '') + lines.slice(endLine + 1).join('\n');

          files[path] = beforeEdit + event.text + afterEdit;
          break;
        }
      }
    }

    return files;
  }

  private static cleanPath(path: string): string {
    return path.startsWith('starter/') ? path.substring(8) : path;
  }
}
