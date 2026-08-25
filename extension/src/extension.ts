import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Scrimba Clone Extension activated');

  const disposable = vscode.commands.registerCommand('scrim.newCourse', () => {
    vscode.window.showInformationMessage('New Course command executed');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
