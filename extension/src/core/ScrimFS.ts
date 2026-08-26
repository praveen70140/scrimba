import * as vscode from 'vscode';

export class ScrimFS implements vscode.FileSystemProvider {
  // Map of filename -> string content
  private files: Map<string, string> = new Map();

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  /**
   * Clears the virtual file system
   */
  clear(): void {
    const events: vscode.FileChangeEvent[] = [];
    for (const path of this.files.keys()) {
      events.push({ type: vscode.FileChangeType.Deleted, uri: vscode.Uri.parse(`scrim:///${path}`) });
    }
    this.files.clear();
    if (events.length > 0) {
      this._emitter.fire(events);
    }
  }

  /**
   * Mounts a new set of files into the virtual file system
   */
  mount(files: Record<string, string>) {
    const oldFiles = new Set(this.files.keys());
    const events: vscode.FileChangeEvent[] = [];
    
    // Process new files
    for (const [path, content] of Object.entries(files)) {
      if (oldFiles.has(path)) {
        // Changed
        this.files.set(path, content);
        events.push({ type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse(`scrim:///${path}`) });
        oldFiles.delete(path);
      } else {
        // Created
        this.files.set(path, content);
        events.push({ type: vscode.FileChangeType.Created, uri: vscode.Uri.parse(`scrim:///${path}`) });
      }
    }
    
    // Any remaining old files were deleted
    for (const path of oldFiles) {
      this.files.delete(path);
      events.push({ type: vscode.FileChangeType.Deleted, uri: vscode.Uri.parse(`scrim:///${path}`) });
    }

    if (events.length > 0) {
      this._emitter.fire(events);
    }
  }

  /**
   * Applies an edit to a specific virtual file, triggering a UI refresh
   */
  applyEdit(path: string, newContent: string) {
    if (!this.files.has(path)) {
      throw vscode.FileSystemError.FileNotFound(path);
    }
    this.files.set(path, newContent);
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse(`scrim:///${path}`) }]);
  }

  /**
   * Retrieves all virtual files as a plain object
   */
  getAllFiles(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [key, val] of this.files.entries()) {
      obj[key] = val;
    }
    return obj;
  }

  // --- vscode.FileSystemProvider implementation ---

  stat(uri: vscode.Uri): vscode.FileStat {
    const p = uri.path.replace(/^\//, ''); // e.g. "src/index.js" or "src"
    
    if (p === '') {
      return { type: vscode.FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0, permissions: vscode.FilePermission.Readonly };
    }

    if (this.files.has(p)) {
      const content = this.files.get(p)!;
      return {
        type: vscode.FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: Buffer.byteLength(content, 'utf-8'),
        permissions: vscode.FilePermission.Readonly
      };
    }

    // Check if it's a directory
    for (const key of this.files.keys()) {
      if (key.startsWith(p + '/')) {
        return { type: vscode.FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0, permissions: vscode.FilePermission.Readonly };
      }
    }

    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const p = uri.path.replace(/^\//, ''); // e.g. "" or "src"
    const prefix = p === '' ? '' : p + '/';
    
    const entries = new Map<string, vscode.FileType>();

    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.substring(prefix.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx === -1) {
          // File directly in this dir
          entries.set(rest, vscode.FileType.File);
        } else {
          // Subdirectory
          const dirName = rest.substring(0, slashIdx);
          entries.set(dirName, vscode.FileType.Directory);
        }
      }
    }

    if (p !== '' && entries.size === 0) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return Array.from(entries.entries());
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const filename = uri.path.replace(/^\//, '');
    if (!this.files.has(filename)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return Buffer.from(this.files.get(filename)!, 'utf-8');
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
    throw vscode.FileSystemError.NoPermissions('Scrim virtual files are strictly read-only.');
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions('Scrim virtual files are strictly read-only.');
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
    throw vscode.FileSystemError.NoPermissions('Scrim virtual files are strictly read-only.');
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions('Scrim virtual files are strictly read-only.');
  }

  watch(_resource: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => { });
  }
}
