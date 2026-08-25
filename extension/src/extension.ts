import * as vscode from 'vscode';
import { CatalogViewProvider } from './ui/CatalogView';
import { MyCoursesViewProvider } from './ui/MyCoursesView';
import { MyForksViewProvider } from './ui/MyForksView';

export function activate(context: vscode.ExtensionContext) {
  console.log('Scrimba Clone Extension activated');

  // Register Tree Views
  vscode.window.registerTreeDataProvider('scrim.catalog', new CatalogViewProvider());
  vscode.window.registerTreeDataProvider('scrim.myCourses', new MyCoursesViewProvider());
  vscode.window.registerTreeDataProvider('scrim.myForks', new MyForksViewProvider());

  const disposable = vscode.commands.registerCommand('scrim.newCourse', () => {
    vscode.window.showInformationMessage('New Course command executed');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
