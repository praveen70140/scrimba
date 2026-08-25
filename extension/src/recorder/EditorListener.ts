import * as vscode from 'vscode';
import * as path from 'path';
import { EventRecorder } from './EventRecorder';

export class EditorListener {
  private disposables: vscode.Disposable[] = [];

  constructor(private recorder: EventRecorder, private workspaceRootFsPath: string) {
    this.registerListeners();
  }

  private registerListeners() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.handleTextChange(e)),
      vscode.window.onDidChangeTextEditorSelection(e => this.handleSelectionChange(e)),
      vscode.window.onDidChangeTextEditorVisibleRanges(e => this.handleScroll(e)),
      vscode.window.onDidChangeActiveTextEditor(e => this.handleEditorFocus(e))
    );
  }

  private getRelativePath(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file') return null;
    const fsPath = uri.fsPath;
    
    // Use path.relative to safely determine if the file is within the workspace root
    const relative = path.relative(this.workspaceRootFsPath, fsPath);
    
    // Reject paths that traverse up or are absolute
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative.replace(/\\/g, '/');
    }
    return null;
  }

  private handleTextChange(e: vscode.TextDocumentChangeEvent) {
    const relativePath = this.getRelativePath(e.document.uri);
    if (!relativePath) return;

    for (const change of e.contentChanges) {
      this.recorder.pushEvent((t) => ({
        t,
        type: 'edit',
        path: relativePath,
        range: [
          [change.range.start.line, change.range.start.character],
          [change.range.end.line, change.range.end.character]
        ],
        text: change.text
      }));
    }
  }

  private handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent) {
    const relativePath = this.getRelativePath(e.textEditor.document.uri);
    if (!relativePath) return;

    // For simplicity, just log the primary selection
    const selection = e.selections[0];
    if (selection.isEmpty) {
      this.recorder.pushEvent((t) => ({
        t,
        type: 'cursor',
        path: relativePath,
        line: selection.active.line,
        col: selection.active.character
      }));
    } else {
      this.recorder.pushEvent((t) => ({
        t,
        type: 'selection',
        path: relativePath,
        anchor: [selection.anchor.line, selection.anchor.character],
        active: [selection.active.line, selection.active.character]
      }));
    }
  }

  private handleScroll(e: vscode.TextEditorVisibleRangesChangeEvent) {
    const relativePath = this.getRelativePath(e.textEditor.document.uri);
    if (!relativePath) return;

    if (e.visibleRanges.length > 0) {
      const topLine = e.visibleRanges[0].start.line;
      this.recorder.pushEvent((t) => ({
        t,
        type: 'scroll',
        path: relativePath,
        top_line: topLine
      }));
    }
  }

  private handleEditorFocus(editor: vscode.TextEditor | undefined) {
    if (!editor) return;
    const relativePath = this.getRelativePath(editor.document.uri);
    if (!relativePath) return;

    this.recorder.pushEvent((t) => ({
      t,
      type: 'file_focus',
      path: relativePath
    }));
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
