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

    // ── File create / delete / rename ─────────────────────────────────────────
    this.disposables.push(
      vscode.workspace.onDidCreateFiles(async (e) => {
        for (const file of e.files) {
          const filePath = this.relativePath(file);
          if (filePath) {
            try {
              const stat = await vscode.workspace.fs.stat(file);
              const isDir = stat.type === vscode.FileType.Directory;
              this.session.recordedEvents.push({ t: this.elapsed, type: 'file_create', path: filePath, is_dir: isDir });
            } catch {
              this.session.recordedEvents.push({ t: this.elapsed, type: 'file_create', path: filePath, is_dir: false });
            }
          }
        }
      }),
      vscode.workspace.onDidDeleteFiles((e) => {
        for (const file of e.files) {
          const filePath = this.relativePath(file);
          if (filePath) {
            this.session.recordedEvents.push({ t: this.elapsed, type: 'file_delete', path: filePath });
          }
        }
      }),
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
