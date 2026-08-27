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

  private get elapsed(): number {
    return Date.now();
  }

  private relativePath(uri: vscode.Uri): string {
    const rel = path.relative(this.workspaceRoot, uri.fsPath);
    // Security: ignore files outside workspace root
    if (path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) {
      return '';
    }
    return rel;
  }

  public start(context: vscode.ExtensionContext): void {
    // ── Text edits ───────────────────────────────────────────────────────────
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        const filePath = this.relativePath(e.document.uri);
        if (!filePath) { return; }
        for (const change of e.contentChanges) {
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
      watcher.onDidCreate(async (uri) => {
        const filePath = this.relativePath(uri);
        if (filePath && !filePath.includes('.git') && !filePath.includes('node_modules')) {
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            const isDir = stat.type === vscode.FileType.Directory;
            let content: string | undefined = undefined;
            if (!isDir) {
              const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
              if (openDoc) {
                content = openDoc.getText();
              } else {
                const fileData = await vscode.workspace.fs.readFile(uri);
                content = Buffer.from(fileData).toString('utf-8');
              }
            }
            this.session.recordedEvents.push({ t: this.elapsed, type: 'file_create', path: filePath, is_dir: isDir, content });
          } catch {
            this.session.recordedEvents.push({ t: this.elapsed, type: 'file_create', path: filePath, is_dir: false });
          }
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

  public stop(): void {
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
