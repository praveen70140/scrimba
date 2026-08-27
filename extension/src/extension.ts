import * as vscode from 'vscode';
import * as path from 'path';
import { CatalogViewProvider } from './ui/CatalogView';
import { MyLearningViewProvider } from './ui/MyLearningView';
import { MyCoursesViewProvider } from './ui/MyCoursesView';
import { MyForksViewProvider } from './ui/MyForksView';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { ScrimSession } from './core/ScrimSession';
import { StateManager } from './core/StateManager';
import { Paths } from './utils/Paths';
import { Recorder } from './recorder/Recorder';
import { Player } from './player/Player';
import { Downloader } from './player/Downloader';
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
  const statusBar = new StatusBar(session, stateManager); // will fix circular dep shortly
  const player = new Player(context, session, stateManager);
  let recorder: Recorder | undefined;
  
  // Hack to satisfy StatusBar needing Player for time sync 
  
  const playerPanel = new PlayerPanel(context, session, player);
  const browserPanel = new BrowserPreviewPanel(context, session);

  player.setPlayerPanel(playerPanel);

  const catalogProvider = new CatalogViewProvider(apiClient);
  const myLearningProvider = new MyLearningViewProvider(apiClient);
  const myCoursesProvider = new MyCoursesViewProvider();
  const myForksProvider = new MyForksViewProvider();
  
  vscode.window.registerTreeDataProvider('scrim.catalog', catalogProvider);
  vscode.window.registerTreeDataProvider('scrim.myLearning', myLearningProvider);
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

    vscode.commands.registerCommand('scrim.renameCourse', async (item?: any) => {
      if (!item || !item.courseId) return;
      const title = await vscode.window.showInputBox({ prompt: 'New course title', value: item.label });
      if (!title) return;
      
      const fs = require('fs/promises') as typeof import('fs/promises');
      const metaPath = path.join(Paths.getCourseDir(item.courseId), 'course.json');
      try {
        const data = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        data.title = title;
        await fs.writeFile(metaPath, JSON.stringify(data, null, 2));
        myCoursesProvider.refresh();
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          vscode.window.showErrorMessage('Failed to rename: metadata file course.json is missing.');
        } else {
          vscode.window.showErrorMessage(`Failed to rename course: ${e.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('scrim.deleteCourse', async (item?: any) => {
      if (!item || !item.courseId) return;
      const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete course ${item.label}?`, { modal: true }, 'Yes');
      if (confirm === 'Yes') {
        const fs = require('fs/promises') as typeof import('fs/promises');
        await fs.rm(Paths.getCourseDir(item.courseId), { recursive: true, force: true });
        myCoursesProvider.refresh();
      }
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

      const languageHint = await vscode.window.showInputBox({ prompt: 'Language hint (e.g., javascript, python, rust)', value: 'javascript' }) || 'javascript';
      const runtimeHint = await vscode.window.showInputBox({ prompt: 'Runtime hint (e.g., node >= 20, python 3.12)', value: 'node >= 20' }) || 'node >= 20';

      const lessonId = 'lesson-' + Date.now();
      session.lessonMeta = { id: lessonId, title, courseId, durationMs: 0 };
      
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);
      
      const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
      const metaUri = vscode.Uri.joinPath(lessonUri, 'lesson.json');
      await vscode.workspace.fs.writeFile(metaUri, Buffer.from(JSON.stringify({ title, languageHint, runtimeHint }, null, 2), 'utf-8'));

      const starterFile = vscode.Uri.joinPath(starterUri, 'index.js');
      await vscode.workspace.fs.writeFile(starterFile, Buffer.from(`// ${title}\nconsole.log('Hello, world!');\n`, 'utf-8'));
      
      myCoursesProvider.refresh();
      
      await vscode.commands.executeCommand('vscode.openFolder', starterUri, {
        forceNewWindow: false,
        filesToOpen: [starterFile],
      });
    }),

    vscode.commands.registerCommand('scrim.renameLesson', async (item?: any) => {
      if (!item || !item.courseId || !item.lessonId) return;
      const title = await vscode.window.showInputBox({ prompt: 'New lesson title', value: item.label });
      if (!title) return;
      
      const fs = require('fs/promises') as typeof import('fs/promises');
      const metaPath = path.join(Paths.getLessonDir(item.courseId, item.lessonId), 'lesson.json');
      try {
        const data = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        data.title = title;
        await fs.writeFile(metaPath, JSON.stringify(data, null, 2));
        myCoursesProvider.refresh();
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          vscode.window.showErrorMessage('Failed to rename: metadata file lesson.json is missing.');
        } else {
          vscode.window.showErrorMessage(`Failed to rename lesson: ${e.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('scrim.deleteLesson', async (item?: any) => {
      if (!item || !item.courseId || !item.lessonId) return;
      const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete lesson ${item.label}?`, { modal: true }, 'Yes');
      if (confirm === 'Yes') {
        const fs = require('fs/promises') as typeof import('fs/promises');
        await fs.rm(Paths.getLessonDir(item.courseId, item.lessonId), { recursive: true, force: true });
        myCoursesProvider.refresh();
      }
    }),


    vscode.commands.registerCommand('scrim.playLesson', async (courseId: string, lessonId: string) => {
      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Downloading lesson assets...',
          cancellable: false
        }, async () => {
          const downloader = new Downloader(apiClient);
          const cacheDir = await downloader.downloadLessonAssets(lessonId);
          
          await player.loadLesson(path.join(cacheDir, 'lesson.scrim'));
          // Set media base dir so PlayerPanel can serve media from cache
          session.lessonDir = cacheDir; 
          
          playerPanel.show(cacheDir, []); // Pass empty forks or load forks if we want
          player.play();
        });
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to play lesson: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.enroll', async (item?: any) => {
      if (!item || !item.courseId) return;
      try {
        await apiClient.enroll(item.courseId);
        vscode.window.showInformationMessage('Enrolled successfully!');
        catalogProvider.refresh();
        myLearningProvider.refresh();
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to enroll: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.markComplete', async (courseId: string, lessonId: string) => {
      try {
        await apiClient.markComplete(lessonId);
        vscode.window.showInformationMessage('Lesson completed!');
        myLearningProvider.refresh();
        
        // Next Lesson auto-navigation
        const course = await apiClient.getCourse(courseId);
        const currentIndex = course.lessons.findIndex(l => l.id === lessonId);
        if (currentIndex !== -1 && currentIndex + 1 < course.lessons.length) {
          const nextLesson = course.lessons[currentIndex + 1];
          vscode.commands.executeCommand('scrim.playLesson', courseId, nextLesson.id);
        }
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to mark lesson complete: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.editCourseMetadata', async (item?: any) => {
      if (!item || !item.courseId) return;
      const desc = await vscode.window.showInputBox({ prompt: 'Enter new course description' });
      const level = await vscode.window.showQuickPick(['beginner', 'intermediate', 'advanced'], { placeHolder: 'Select level' });
      if (desc && level) {
        await apiClient.request('PUT', `/courses/${item.courseId}`, { description: desc, level });
        myCoursesProvider.refresh();
      }
    }),
    
    vscode.commands.registerCommand('scrim.moveLessonUp', async (item?: any) => {
      if (!item || !item.courseId || !item.lessonId) return;
      try {
        const course = await apiClient.getCourse(item.courseId);
        const idx = course.lessons.findIndex(l => l.id === item.lessonId);
        if (idx > 0) {
          const newOrder = [...course.lessons];
          [newOrder[idx-1], newOrder[idx]] = [newOrder[idx], newOrder[idx-1]];
          await apiClient.request('PUT', `/courses/${item.courseId}/lessons/order`, { 
            lessonIds: newOrder.map(l => l.id) 
          });
          myCoursesProvider.refresh();
        }
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to reorder: ' + e.message);
      }
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
      
      const fsNode = require('fs/promises');
      try {
        const metaStr = await fsNode.readFile(path.join(lessonDir, 'lesson.json'), 'utf8');
        session.lessonMeta = JSON.parse(metaStr);
      } catch (e) {
        console.warn('Failed to load lesson.json', e);
      }
      
      const fs = require('fs');
      if (!fs.existsSync(path.join(lessonDir, 'starter'))) {
        vscode.window.showErrorMessage('The selected lesson directory is invalid (missing "starter" folder).');
        return;
      }
      
      recorder = new Recorder(session, lessonDir);
      
      // Start recording
      await recorder.start(context);
      browserPanel.showLive('http://localhost:3000');
    }),

    
    vscode.commands.registerCommand('scrim.resume', async () => {
      // Resume playback after a fork or challenge
      if (session.playerState === 'FORKED' || session.playerState === 'CHALLENGE') {
        stateManager.transition('PLAYING');
      }
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
            if (!require('fs').existsSync(mp4Path)) {
              vscode.window.showWarningMessage('Screen recording is still being transcoded. Please try again in a few moments.');
              return;
            }
        }

        await playerPanel.show(lessonDir);
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to load lesson: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.publishLesson', async (item?: any) => {
      let lessonDir: string | undefined;
      let lessonId: string | undefined;

      if (item && item.courseId && item.lessonId) {
        lessonDir = Paths.getLessonDir(item.courseId, item.lessonId);
        lessonId = item.lessonId;
      } else {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const fsPath = activeEditor.document.uri.fsPath;
          let current = path.dirname(fsPath);
          while (current.includes('lesson-')) {
            if (path.basename(current).startsWith('lesson-')) {
              lessonDir = current;
              lessonId = path.basename(current);
              break;
            }
            current = path.dirname(current);
          }
        }
      }

      if (!lessonDir || !lessonId) {
        vscode.window.showErrorMessage('Please right click a lesson in the My Courses view to publish.');
        return;
      }

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Publishing lesson...",
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ message: 'Getting upload URLs...' });
          const urls = await apiClient.getUploadUrls(lessonId);

          const fs = require('fs') as typeof import('fs');
          const https = require('https');
          const http = require('http');

          const uploadFile = (filePath: string, urlStr: string) => {
            return new Promise<void>((resolve, reject) => {
              if (!fs.existsSync(filePath)) {
                console.log(`Skipping missing file: ${filePath}`);
                resolve();
                return;
              }
              const stats = fs.statSync(filePath);
              const url = new URL(urlStr);
              const lib = url.protocol === 'https:' ? https : http;
              
              const req = lib.request(url, {
                method: 'PUT',
                headers: {
                  'Content-Length': stats.size,
                },
                timeout: 60000 // 60 seconds
              }, (res: any) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                  resolve();
                } else {
                  reject(new Error(`Failed to upload ${filePath}: ${res.statusCode}`));
                }
              });

              req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Upload timed out for ${filePath}`));
              });

              req.on('error', (err: any) => {
                reject(err);
              });

              const stream = fs.createReadStream(filePath);
              stream.on('error', (err: any) => {
                req.destroy();
                reject(err);
              });

              stream.pipe(req);
            });
          };

          progress.report({ message: 'Uploading lesson.scrim...' });
          await uploadFile(path.join(lessonDir, 'lesson.scrim'), urls.scrim_url);

          progress.report({ message: 'Uploading audio...' });
          await uploadFile(path.join(lessonDir, 'audio.ogg'), urls.audio_url);

          progress.report({ message: 'Uploading webcam video...' });
          await uploadFile(path.join(lessonDir, 'webcam.mp4'), urls.video_url);

          progress.report({ message: 'Uploading screen recording...' });
          await uploadFile(path.join(lessonDir, 'screen.mp4'), urls.screen_url);

          progress.report({ message: 'Marking as published...' });
          await apiClient.publishLesson(lessonId);

          vscode.window.showInformationMessage('Lesson published successfully!');
        } catch (e: any) {
          vscode.window.showErrorMessage('Failed to publish lesson: ' + e.message);
        }
      });
    })
  );
}

export function deactivate() {}
