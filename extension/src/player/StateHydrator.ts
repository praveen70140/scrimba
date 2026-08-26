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

    for (const event of events) {
      if (event.t > targetTimeMs) {
        break; // Events are assumed to be sorted by time
      }

      switch (event.type) {
        case 'file_create': {
          const path = this.cleanPath(event.path);
          if (!event.is_dir) {
            files[path] = '';
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

          if (startLine < 0 || startLine >= lines.length || endLine < 0 || endLine >= lines.length) continue;
          if (startCol < 0 || startCol > lines[startLine].length || endCol < 0 || endCol > lines[endLine].length) continue;
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
