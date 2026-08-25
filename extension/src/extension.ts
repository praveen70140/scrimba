import * as vscode from 'vscode';
import { CatalogViewProvider } from './ui/CatalogView';
import { MyCoursesViewProvider } from './ui/MyCoursesView';
import { MyForksViewProvider } from './ui/MyForksView';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { ScrimFS } from './core/ScrimFS';
import { TerminalProxy } from './recorder/TerminalProxy';
import { MediaRecorder } from './recorder/MediaRecorder';
import { WebviewManager } from './preview/WebviewManager';
import { Paths } from './utils/Paths';

export function activate(context: vscode.ExtensionContext) {
  console.log('Scrimba Clone Extension activated');

  const scrimFs = new ScrimFS();
  const mediaRecorder = new MediaRecorder();
  const webviewManager = new WebviewManager();

  // Register Virtual File System
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('scrim', scrimFs, { isCaseSensitive: true, isReadonly: true })
  );

  // Register Tree Views
  vscode.window.registerTreeDataProvider('scrim.catalog', new CatalogViewProvider());
  vscode.window.registerTreeDataProvider('scrim.myCourses', new MyCoursesViewProvider());
  vscode.window.registerTreeDataProvider('scrim.myForks', new MyForksViewProvider());

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('scrim.newCourse', async () => {
      const courseId = 'course-' + Date.now();
      await WorkspaceManager.initCourse(courseId, { id: courseId, title: "New Course" });
      vscode.window.showInformationMessage(`Created course ${courseId}`);
    }),

    vscode.commands.registerCommand('scrim.startRecording', async () => {
      await mediaRecorder.startRecording('mock-lesson-123');
      const term = new TerminalProxy(Paths.getBaseDir());
      term.show();
      context.subscriptions.push(term);
    }),

    vscode.commands.registerCommand('scrim.stopRecording', async () => {
      await mediaRecorder.stopRecording();
    }),

    vscode.commands.registerCommand('scrim.previewLesson', () => {
      webviewManager.showBrowser(context, 'http://localhost:3000');
    })
  );
}

export function deactivate() {}
