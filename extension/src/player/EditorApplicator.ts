import * as vscode from 'vscode';
import { ScrimFS } from '../core/ScrimFS';
import { ScrimEvent } from '@scrimba-clone/shared';

export class EditorApplicator {
  constructor(private scrimFs: ScrimFS) {}

  private getUri(path: string): vscode.Uri {
    const cleanPath = path.startsWith('starter/') ? path.substring(8) : path;
    return vscode.Uri.from({ scheme: 'scrim', path: `/${cleanPath}` });
  }

  private cleanPath(path: string): string {
    return path.startsWith('starter/') ? path.substring(8) : path;
  }

  public async applyEvent(event: ScrimEvent) {
    switch (event.type) {
      case 'file_open':
        await this.handleFileOpen(event.path);
        break;
      case 'file_focus':
        await this.handleFileFocus(event.path);
        break;
      case 'edit':
        this.handleEdit(event.path, event.range, event.text);
        break;
      case 'cursor':
      case 'selection':
        this.handleSelection(event);
        break;
      case 'scroll':
        this.handleScroll(event.path, event.top_line);
        break;
    }
  }

  private async handleFileOpen(path: string) {
    await vscode.commands.executeCommand('vscode.open', this.getUri(path), { preview: false, preserveFocus: true });
  }

  private async handleFileFocus(path: string) {
    await vscode.commands.executeCommand('vscode.open', this.getUri(path), { preview: false, preserveFocus: false });
  }

  private handleEdit(path: string, range: [[number, number], [number, number]], newText: string) {
    path = this.cleanPath(path);
    const fileContent = this.scrimFs.getAllFiles()[path];
    if (fileContent === undefined) return;

    const lines = fileContent.split('\n');
    const [startLine, startCol] = range[0];
    const [endLine, endCol] = range[1];

    if (startLine < 0 || startLine >= lines.length || endLine < 0 || endLine >= lines.length) return;
    if (startCol < 0 || startCol > lines[startLine].length || endCol < 0 || endCol > lines[endLine].length) return;
    if (startLine > endLine || (startLine === endLine && startCol > endCol)) return;

    const beforeEdit = lines.slice(0, startLine).join('\n') + (startLine > 0 ? '\n' : '') + lines[startLine].substring(0, startCol);
    const afterEdit = lines[endLine].substring(endCol) + (endLine < lines.length - 1 ? '\n' : '') + lines.slice(endLine + 1).join('\n');

    const updatedContent = beforeEdit + newText + afterEdit;
    this.scrimFs.applyEdit(path, updatedContent);
  }

  private handleSelection(event: Extract<ScrimEvent, { type: 'cursor' | 'selection' }>) {
    const uri = this.getUri(this.cleanPath(event.path));
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
    if (editor) {
      if (event.type === 'cursor') {
        const pos = new vscode.Position(event.line, event.col);
        editor.selection = new vscode.Selection(pos, pos);
      } else {
        const anchor = new vscode.Position(event.anchor[0], event.anchor[1]);
        const active = new vscode.Position(event.active[0], event.active[1]);
        editor.selection = new vscode.Selection(anchor, active);
      }
    }
  }

  private handleScroll(path: string, topLine: number) {
    const uri = this.getUri(path);
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
    if (editor) {
      const pos = new vscode.Position(topLine, 0);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
    }
  }
}
