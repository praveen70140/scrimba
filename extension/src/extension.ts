import * as vscode from 'vscode';
import * as path from 'path';
import { CatalogViewProvider } from './ui/CatalogView';
import { MyCoursesViewProvider } from './ui/MyCoursesView';
import { MyForksViewProvider } from './ui/MyForksView';
import { WorkspaceManager } from './workspace/WorkspaceManager';
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

  const session = new ScrimSession();
  const stateManager = new StateManager(session);
  const statusBar = new StatusBar(session, null as any, stateManager); // will fix circular dep shortly
  const player = new Player(context, session, stateManager);
  let recorder: Recorder | undefined;
  
  // Hack to satisfy StatusBar needing Player for time sync 
  (statusBar as any).player = player;

  const playerPanel = new PlayerPanel(context, session, player);
  const browserPanel = new BrowserPreviewPanel(context, session);

  player.setPlayerPanel(playerPanel);

  const catalogProvider = new CatalogViewProvider();
  const myCoursesProvider = new MyCoursesViewProvider();
  const myForksProvider = new MyForksViewProvider();

  vscode.window.registerTreeDataProvider('scrim.catalog', catalogProvider);
  vscode.window.registerTreeDataProvider('scrim.myCourses', myCoursesProvider);
  vscode.window.registerTreeDataProvider('scrim.myForks', myForksProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('scrim.openFork', async (uri: vscode.Uri) => {
      if (uri) {
        await WorkspaceManager.openFork(uri, context);
      }
    }),

    // ── External ─────────────────────────────────────────────────────────────────
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
    vscode.commands.registerCommand('scrim.newLesson', async (item?: any) => {
      let courseId = item?.courseId;

      if (!courseId) {
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
        courseId = await vscode.window.showQuickPick(courseDirs, { placeHolder: 'Select the course this lesson belongs to' });
      }

      if (!courseId) { return; }
      const title = await vscode.window.showInputBox({ prompt: 'Lesson title' });
      if (!title) { return; }

      const lessonId = 'lesson-' + Date.now();
      session.lessonMeta = { id: lessonId, title, courseId, durationMs: 0 };
      
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);
      
      const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
      const metaUri = vscode.Uri.joinPath(lessonUri, 'lesson.json');
      await vscode.workspace.fs.writeFile(metaUri, Buffer.from(JSON.stringify({ title }, null, 2), 'utf-8'));

      const starterFile = vscode.Uri.joinPath(starterUri, 'index.js');
      await vscode.workspace.fs.writeFile(starterFile, Buffer.from(`// ${title}\nconsole.log('Hello, world!');\n`, 'utf-8'));
      
      myCoursesProvider.refresh();
      
      await vscode.commands.executeCommand('vscode.openFolder', starterUri, {
        forceNewWindow: false,
        filesToOpen: [starterFile],
      });
    }),


    vscode.commands.registerCommand('scrim.startRecording', async (item?: any) => {
      if (session.isRecording) {
        vscode.window.showWarningMessage('Recording already in progress.');
        return;
      }
      
      let lessonDir: string | undefined;
      let wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (wsFolder && path.basename(wsFolder.uri.fsPath) === 'starter') {
        lessonDir = path.dirname(wsFolder.uri.fsPath);
      }
      
      // If triggered from tree view, use the tree item's path directly
      if (item && item.courseId && item.lessonId) {
        lessonDir = Paths.getLessonDir(item.courseId, item.lessonId);
      } else if (!lessonDir) {
        // Fallback to active editor's path (useful for keyboard shortcuts)
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const fsPath = activeEditor.document.uri.fsPath;
          if (fsPath.includes(path.join('.scrimba', 'courses'))) {
            // Traverse up to find the lesson-xxx directory
            let current = path.dirname(fsPath);
            while (current.includes('lesson-')) {
              if (path.basename(current).startsWith('lesson-')) {
                lessonDir = current;
                break;
              }
              current = path.dirname(current);
            }
          }
        }
      }

      if (!lessonDir) {
        vscode.window.showErrorMessage('Open a lesson workspace or file first before recording, or start it from the My Courses view.');
        return;
      }
      
      recorder = new Recorder(session, lessonDir);
      
      // Start recording
      await recorder.start(context);
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

    // ── Preview & Publish ────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.previewLesson', async (item?: any) => {
      let lessonDir: string | undefined;

      if (item && item.courseId && item.lessonId) {
        lessonDir = Paths.getLessonDir(item.courseId, item.lessonId);
      } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && path.basename(workspaceFolders[0].uri.fsPath) === 'starter') {
          lessonDir = path.dirname(workspaceFolders[0].uri.fsPath);
        } else {
          // Fallback to active editor's path
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const fsPath = activeEditor.document.uri.fsPath;
            if (fsPath.includes(path.join('.scrimba', 'courses'))) {
              let current = path.dirname(fsPath);
              while (current.includes('lesson-')) {
                if (path.basename(current).startsWith('lesson-')) {
                  lessonDir = current;
                  break;
                }
                current = path.dirname(current);
              }
            }
          }
        }
        
        if (!lessonDir) {
          vscode.window.showErrorMessage('No lesson workspace or file open.');
          return;
        }
      }
      const scrimFile = path.join(lessonDir, 'lesson.scrim');
      
      try {
        await player.loadLesson(scrimFile);
        
        // Transcode WebM to MP4 for VS Code compatibility
        const { FfmpegConverter } = require('./utils/FfmpegConverter');
        const webmPath = path.join(lessonDir, 'screen.webm');
        const mp4Path = path.join(lessonDir, 'screen.mp4');
        if (require('fs').existsSync(webmPath)) {
            try {
                await FfmpegConverter.convertToMp4(webmPath, mp4Path);
            } catch (err) {
                console.error("FFMPEG transcoding failed:", err);
            }
        }

        await playerPanel.show(lessonDir);
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
