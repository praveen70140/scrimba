import * as vscode from 'vscode';
import { CourseSchema } from '@scrimba/shared';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "scrim-extension" is now active!');

    let disposable = vscode.commands.registerCommand('scrim.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Scrim!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
