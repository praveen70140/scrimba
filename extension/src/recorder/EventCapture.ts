import * as vscode from 'vscode';
import * as path from 'path';
import { ScrimSession } from '../core/ScrimSession';

/**
 * EventCapture listens to VS Code APIs and converts them to ScrimEvent[]
 * stored directly on the ScrimSession.
 *
 * Replaces the old EditorListener.ts with proper session integration.
 */
export class EventCapture {
  private disposables: vscode.Disposable[] = [];
  private session: ScrimSession;
  private workspaceRoot: string;

  constructor(session: ScrimSession, workspaceRoot: string) {
    this.session = session;
    this.workspaceRoot = workspaceRoot;
  }

  private fallbackStartMs = Date.now();

  private get elapsed(): number {
    return Date.now() - (this.session.recordingStartMs || this.fallbackStartMs);
  }

  private relativePath(uri: vscode.Uri): string {
    if (uri.scheme !== 'file') return '';
    const rel = path.relative(this.workspaceRoot, uri.fsPath);
    // Security: ignore files outside workspace root
    if (path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) {
      return '';
    }
    return rel;
  }

  private createQueue: Promise<void> = Promise.resolve();
  private sessionGeneration = 0;

  public start(context: vscode.ExtensionContext): void {
    this.fallbackStartMs = Date.now();
    const wsFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath).join(', ') || 'NONE';
    console.log(`[EventCapture] Started. workspaceRoot="${this.workspaceRoot}", recordingStartMs=${this.session.recordingStartMs}`);
    console.log(`[EventCapture] VS Code workspace folders: ${wsFolders}`);

    // ── Terminal events (proposed APIs — must not crash if not available) ───
    try {
      if ((vscode.window as any).onDidWriteTerminalData) {
        this.disposables.push(
          (vscode.window as any).onDidWriteTerminalData((e: any) => {
            this.session.recordedEvents.push({
              t: this.elapsed,
              type: 'terminal_out',
              text: e.data,
            });
          })
        );
      }
    } catch {
      console.warn('[EventCapture] onDidWriteTerminalData not available (proposed API not enabled)');
    }
    
    try {
      if ((vscode.window as any).onDidStartTerminalShellExecution) {
        this.disposables.push(
          (vscode.window as any).onDidStartTerminalShellExecution((e: any) => {
            this.session.recordedEvents.push({
              t: this.elapsed,
              type: 'terminal_cmd',
              text: e.execution?.commandLine?.value || 'unknown command',
            });
          })
        );
      }
    } catch {
      console.warn('[EventCapture] onDidStartTerminalShellExecution not available (proposed API not enabled)');
    }

    this.sessionGeneration++;
    const generation = this.sessionGeneration;
    // ── Text edits ───────────────────────────────────────────────────────────
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        const rawPath = e.document.uri.fsPath;
        const filePath = this.relativePath(e.document.uri);
        if (!filePath) {
          console.log(`[EventCapture] IGNORED edit in "${rawPath}" (outside workspaceRoot "${this.workspaceRoot}")`);
          return;
        }
        for (const change of e.contentChanges) {
          console.log(`[EventCapture] edit t=${this.elapsed} path="${filePath}" text="${change.text.slice(0, 30).replace(/\n/g, '\\n')}"`);
          this.session.recordedEvents.push({
            t: this.elapsed,
            type: 'edit',
            path: filePath,
            range: [
              [change.range.start.line, change.range.start.character],
              [change.range.end.line, change.range.end.character],
            ],
            text: change.text,
          });
        }
      })
    );

    // ── Cursor & selection ───────────────────────────────────────────────────
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        const filePath = this.relativePath(e.textEditor.document.uri);
        if (!filePath) { return; }
        const sel = e.selections[0];
        if (sel.isEmpty) {
          this.session.recordedEvents.push({
            t: this.elapsed,
            type: 'cursor',
            path: filePath,
            line: sel.active.line,
            col: sel.active.character,
          });
        } else {
          this.session.recordedEvents.push({
            t: this.elapsed,
            type: 'selection',
            path: filePath,
            anchor: [sel.anchor.line, sel.anchor.character],
            active: [sel.active.line, sel.active.character],
          });
        }
      })
    );

    // ── Scroll ───────────────────────────────────────────────────────────────
    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        const filePath = this.relativePath(e.textEditor.document.uri);
        if (!filePath) { return; }
        const topLine = e.visibleRanges[0]?.start.line ?? 0;
        this.session.recordedEvents.push({
          t: this.elapsed,
          type: 'scroll',
          path: filePath,
          top_line: topLine,
        });
      })
    );

    // ── File open / focus ─────────────────────────────────────────────────────
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        const filePath = this.relativePath(doc.uri);
        if (!filePath) { return; }
        this.session.recordedEvents.push({ t: this.elapsed, type: 'file_open', path: filePath });
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) { return; }
        const filePath = this.relativePath(editor.document.uri);
        if (!filePath) { return; }
        this.session.recordedEvents.push({ t: this.elapsed, type: 'file_focus', path: filePath });
      })
    );

    // ── Robust File System Watcher ───────────────────────────────────────────
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, '**/*')
    );
    this.disposables.push(watcher);

    this.disposables.push(
      watcher.onDidCreate((uri) => {
        const filePath = this.relativePath(uri);
        if (filePath && !filePath.includes('.git') && !filePath.includes('node_modules')) {
          const t = this.elapsed;
          const currentGen = generation;
          
          const workPromise = (async () => {
            try {
              const stat = await vscode.workspace.fs.stat(uri);
              if (this.sessionGeneration !== currentGen) return null;
              
              const isDir = stat.type === vscode.FileType.Directory;
              let content: string | undefined = undefined;
              if (!isDir) {
                if (stat.size > 1024 * 500) {
                  content = "// File omitted: exceeds 500KB size limit";
                } else {
                  const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
                  if (openDoc) {
                    content = openDoc.getText();
                  } else {
                    const fileData = await vscode.workspace.fs.readFile(uri);
                    if (this.sessionGeneration !== currentGen) return null;
                    content = Buffer.from(fileData).toString('utf-8');
                  }
                }
              }
              return { t, type: 'file_create' as const, path: filePath, is_dir: isDir, content };
            } catch (e) {
              return null;
            }
          })();

          this.createQueue = this.createQueue.then(async () => {
            const event = await workPromise;
            if (event && this.sessionGeneration === currentGen) {
              this.session.recordedEvents.push(event);
            }
          });
        }
      }),
      watcher.onDidDelete((uri) => {
        const filePath = this.relativePath(uri);
        if (filePath && !filePath.includes('.git') && !filePath.includes('node_modules')) {
          this.session.recordedEvents.push({ t: this.elapsed, type: 'file_delete', path: filePath });
        }
      })
      // Note: FileSystemWatcher does not have onDidRename, it emits Delete then Create.
      // We also keep the VS Code specific rename event for atomic rename tracking if they use the UI.
    );

    this.disposables.push(
      vscode.workspace.onDidRenameFiles((e) => {
        for (const file of e.files) {
          const oldPath = this.relativePath(file.oldUri);
          const newPath = this.relativePath(file.newUri);
          if (oldPath && newPath) {
            this.session.recordedEvents.push({ t: this.elapsed, type: 'file_rename', old_path: oldPath, new_path: newPath });
          }
        }
      })
    );
  }

  public async stop(): Promise<void> {
    this.sessionGeneration++;
    await this.createQueue;
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
