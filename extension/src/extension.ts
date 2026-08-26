import * as vscode from 'vscode';
import * as path from 'path';
import { CatalogViewProvider } from './ui/CatalogView';
import { MyCoursesViewProvider } from './ui/MyCoursesView';
import { MyForksViewProvider } from './ui/MyForksView';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { ScrimFS } from './core/ScrimFS';
import { ScrimSession } from './core/ScrimSession';
import { StateManager } from './core/StateManager';
import { Paths } from './utils/Paths';
import { Recorder } from './recorder/Recorder';
import { Player } from './player/Player';
import { PlayerPanel } from './ui/PlayerPanel';
import { BrowserPreviewPanel } from './ui/BrowserPreviewPanel';
import { StatusBar } from './ui/StatusBar';
import { ApiClient } from './api/ApiClient';
import { Auth } from './api/Auth';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Scrimba Clone Extension activated');

  const apiClient = new ApiClient();
  const auth = new Auth(context.secrets, apiClient);
  await auth.init();

  const scrimFs = new ScrimFS();
  const session = new ScrimSession();
  const stateManager = new StateManager(session);
  const statusBar = new StatusBar(session, null as any, stateManager); // will fix circular dep shortly
  const player = new Player(session, stateManager, scrimFs);
  let recorder: Recorder | undefined;
  
  // Hack to satisfy StatusBar needing Player for time sync 
  (statusBar as any).player = player;

  const playerPanel = new PlayerPanel(context, session, player);
  const browserPanel = new BrowserPreviewPanel(context, session);

  // Register Virtual File System
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('scrim', scrimFs, { isCaseSensitive: true, isReadonly: true })
  );

  const catalogProvider = new CatalogViewProvider();
  const myCoursesProvider = new MyCoursesViewProvider();
  const myForksProvider = new MyForksViewProvider();

  vscode.window.registerTreeDataProvider('scrim.catalog', catalogProvider);
  vscode.window.registerTreeDataProvider('scrim.myCourses', myCoursesProvider);
  vscode.window.registerTreeDataProvider('scrim.myForks', myForksProvider);

  context.subscriptions.push(
    // ── Auth ─────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.login', async () => {
      const email = await vscode.window.showInputBox({ prompt: 'Email' });
      if (!email) { return; }
      const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
      if (!password) { return; }
      try {
        const res = await apiClient.login(email, password);
        if (!res || !res.token) {
          throw new Error('No token received from backend.');
        }
        await auth.setToken(res.token);
        vscode.window.showInformationMessage(`Logged in as ${res.user?.email}`);
      } catch (e: any) {
        vscode.window.showErrorMessage('Login failed: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.register', async () => {
      const email = await vscode.window.showInputBox({ prompt: 'Email' });
      if (!email) return;
      const username = await vscode.window.showInputBox({ prompt: 'Username' });
      if (!username) return;
      const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
      if (!password) return;
      try {
        const res = await apiClient.register(email, username, password);
        if (!res || !res.token) {
          throw new Error('No token received from backend. Check if the server is running properly.');
        }
        await auth.setToken(res.token);
        vscode.window.showInformationMessage(`Registered and logged in as ${res.user?.username}`);
      } catch (e: any) {
        vscode.window.showErrorMessage('Registration failed: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.logout', async () => {
      await auth.clearToken();
      vscode.window.showInformationMessage('Logged out.');
    }),

    // ── Courses ──────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.newCourse', async () => {
      const title = await vscode.window.showInputBox({ prompt: 'Course title', placeHolder: 'e.g. Intro to TypeScript' });
      if (!title) { return; }
      const courseId = 'course-' + Date.now();
      await WorkspaceManager.initCourse(courseId, { id: courseId, title });
      myCoursesProvider.refresh();
      vscode.window.showInformationMessage(`Created course: ${title}`);
    }),

    // ── Lessons & Recording ──────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.newLesson', async () => {
      const coursesDir = Paths.getBaseDir();
      const fs = require('fs') as typeof import('fs');
      let courseDirs: string[] = [];
      try {
        courseDirs = fs.readdirSync(path.join(coursesDir, 'courses'))
          .filter((d: string) => fs.statSync(path.join(coursesDir, 'courses', d)).isDirectory());
      } catch {}

      if (courseDirs.length === 0) {
        vscode.window.showWarningMessage('No courses found.');
        return;
      }
      const courseId = await vscode.window.showQuickPick(courseDirs, { placeHolder: 'Select the course this lesson belongs to' });
      if (!courseId) { return; }
      const title = await vscode.window.showInputBox({ prompt: 'Lesson title' });
      if (!title) { return; }

      const lessonId = 'lesson-' + Date.now();
      session.lessonMeta = { id: lessonId, title, courseId, durationMs: 0 };
      
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);
      const starterFile = vscode.Uri.joinPath(starterUri, 'index.js');
      await vscode.workspace.fs.writeFile(starterFile, Buffer.from(`// ${title}\nconsole.log('Hello, world!');\n`, 'utf-8'));
      
      myCoursesProvider.refresh();
      await WorkspaceManager.openEditable(starterUri);
      vscode.window.showInformationMessage(`Lesson "${title}" created! Press "Scrim: Start Recording" when ready.`);
    }),

    vscode.commands.registerCommand('scrim.startRecording', async () => {
      if (session.isRecording) {
        vscode.window.showWarningMessage('Recording already in progress.');
        return;
      }
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (!wsFolder) {
        vscode.window.showErrorMessage('Open a lesson workspace first before recording.');
        return;
      }
      
      const lessonDir = path.dirname(wsFolder.uri.fsPath); // e.g. ~/.scrimba/courses/<cId>/lessons/<lId>
      recorder = new Recorder(session, lessonDir);
      
      // Start recording
      await recorder.start(context, { x: 0, y: 0, width: 800, height: 600 }); // Mock region for now
      browserPanel.showLive('http://localhost:3000');
    }),

    vscode.commands.registerCommand('scrim.stopRecording', async () => {
      if (!session.isRecording || !recorder) return;
      await recorder.stop();
      recorder.dispose();
      recorder = undefined;
      vscode.window.showInformationMessage('Recording stopped and lesson.scrim saved.');
    }),

    vscode.commands.registerCommand('scrim.markChapter', async () => {
      if (!session.isRecording || !recorder) return;
      const label = await vscode.window.showInputBox({ prompt: 'Chapter label' });
      if (label) recorder.addChapter(label);
    }),

    vscode.commands.registerCommand('scrim.addChallenge', async () => {
      if (!session.isRecording || !recorder) return;
      const prompt = await vscode.window.showInputBox({ prompt: 'Challenge prompt' });
      if (!prompt) return;
      const testCmd = await vscode.window.showInputBox({
        prompt: 'Test command (leave empty for manual check)',
        placeHolder: 'e.g. node test.js'
      });
      recorder.addChallenge('ch-' + Date.now(), prompt, testCmd ?? '');
    }),

    // ── Playback ─────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.togglePlayPause', () => {
      if (session.playerState === 'PLAYING') player.pause();
      else if (session.playerState === 'PAUSED' || session.playerState === 'IDLE') player.play();
    }),

    vscode.commands.registerCommand('scrim.fork', async () => {
      await player.fork();
    }),

    vscode.commands.registerCommand('scrim.resume', async () => {
      await player.resumeFromFork();
    }),

    // ── Preview & Publish ────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.previewLesson', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('No lesson workspace open.');
        return;
      }
      let lessonDir = workspaceFolders[0].uri.fsPath;
      if (path.basename(lessonDir) === 'starter') {
        lessonDir = path.dirname(lessonDir);
      }
      const scrimFile = path.join(lessonDir, 'lesson.scrim');
      
      try {
        await player.loadLesson(scrimFile);
        playerPanel.show();
        browserPanel.showRecordedVideo();
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to load lesson: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.publishLesson', async () => {
      vscode.window.showInformationMessage('Publishing lesson (mocked)');
    })
  );
}

export function deactivate() {}
