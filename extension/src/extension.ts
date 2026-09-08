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
      
      try {
        const created = await apiClient.createCourse(title);
        const courseId = created.id;
        await WorkspaceManager.initCourse(courseId, { id: courseId, title });
        myCoursesProvider.refresh();
        vscode.window.showInformationMessage(`Created course: ${title}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create course on server: ${e.message}`);
      }
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

      const fs = require('fs') as typeof import('fs');
      const templatesDir = path.join(__dirname, '..', 'templates');
      let templates = ['node-20', 'python-312', 'rust-stable', 'go-122'];
      try {
        templates = fs.readdirSync(templatesDir).filter((d: string) => fs.statSync(path.join(templatesDir, d)).isDirectory());
      } catch {}

      const templateName = await vscode.window.showQuickPick(templates, { placeHolder: 'Select a runtime template' });
      if (!templateName) return;

      const languageHint = templateName;
      const runtimeHint = templateName;

      let lessonId: string;
      try {
        const created = await apiClient.createLesson(courseId, title);
        lessonId = created.id;
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create lesson on server: ${e.message}`);
        return;
      }

      session.lessonMeta = { id: lessonId, title, courseId, durationMs: 0 };
      
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);
      
      const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
      const metaUri = vscode.Uri.joinPath(lessonUri, 'lesson.json');
      await vscode.workspace.fs.writeFile(
        metaUri,
        Buffer.from(JSON.stringify({ id: lessonId, courseId, title, languageHint, runtimeHint }, null, 2), 'utf-8')
      );

      const templateDir = path.join(templatesDir, templateName);
      let filesToOpen: vscode.Uri[] = [];
      if (fs.existsSync(templateDir)) {
        await vscode.workspace.fs.copy(vscode.Uri.file(templateDir), starterUri, { overwrite: true });
      } else {
        const starterFile = vscode.Uri.joinPath(starterUri, 'index.js');
        await vscode.workspace.fs.writeFile(starterFile, Buffer.from(`// ${title}\nconsole.log('Hello, world!');\n`, 'utf-8'));
        filesToOpen.push(starterFile);
      }
      
      myCoursesProvider.refresh();
      
      // Add the starter folder to the VS Code workspace so the Explorer shows the files.
      // If VS Code already has workspace folders open (multi-root), updateWorkspaceFolders
      // adds it without a reload. If there are no folders yet, we must use openFolder
      // which will reload the window — that's unavoidable (VS Code requires it), but the
      // extension will reactivate and the user can then start recording normally.
      const existingFolders = vscode.workspace.workspaceFolders;
      if (existingFolders && existingFolders.length > 0) {
        // Multi-root: add starter alongside existing folders (no reload)
        const alreadyAdded = existingFolders.some(f => f.uri.fsPath === starterUri.fsPath);
        if (!alreadyAdded) {
          // Remove any other scrimba starter folders first (highest index first)
          const removeIndexes = existingFolders
            .map((f, i) => ({ f, i }))
            .filter(({ f }) =>
              f.uri.fsPath.includes(path.join('.scrimba', 'courses')) && f.uri.fsPath.endsWith('starter')
            )
            .map(({ i }) => i)
            .reverse();
          for (const idx of removeIndexes) {
            vscode.workspace.updateWorkspaceFolders(idx, 1);
          }
          vscode.workspace.updateWorkspaceFolders(
            vscode.workspace.workspaceFolders?.length ?? 0,
            0,
            { uri: starterUri, name: title }
          );
        }
        // Open the best file to edit (prefer index.js over flake.nix etc.)
        const preferredNames = ['index.js', 'main.js', 'index.ts', 'main.ts', 'index.py', 'main.py', 'main.rs', 'main.go'];
        const allFiles = fs.readdirSync(starterUri.fsPath).filter((f: string) => !f.startsWith('.') && fs.statSync(path.join(starterUri.fsPath, f)).isFile());
        const fileToOpen = preferredNames.find(n => allFiles.includes(n)) || allFiles[0];
        if (fileToOpen) {
          try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(starterUri, fileToOpen));
            await vscode.window.showTextDocument(doc, { preview: false });
          } catch {}
        }
      } else {
        // No workspace open yet — openFolder is unavoidable (VS Code must reload to open a folder).
        // The extension will reactivate after reload; user can then start recording.
        await vscode.commands.executeCommand('vscode.openFolder', starterUri, { forceNewWindow: false });
        return; // Extension host will restart, remaining code won't run
      }
      vscode.window.showInformationMessage(`Lesson "${title}" created. You can now start recording.`);
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
          
          playerPanel.show(cacheDir); // Pass empty forks or load forks if we want
          player.play();
        });
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to play lesson: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.searchCatalog', async () => {
      const query = await vscode.window.showInputBox({ prompt: 'Search courses by title, tag, or level' });
      if (query !== undefined) {
        catalogProvider.setSearchQuery(query);
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

    vscode.commands.registerCommand('scrim.markComplete', async (courseId: string, lessonId: string, navigate: boolean = true) => {
      try {
        await apiClient.markComplete(lessonId);
        vscode.window.showInformationMessage('Lesson completed!');
        myLearningProvider.refresh();
        
        // Next Lesson auto-navigation (only if explicitly requested)
        if (navigate) {
          const course = await apiClient.getCourse(courseId);
          const currentIndex = course.lessons.findIndex(l => l.id === lessonId);
          if (currentIndex !== -1 && currentIndex + 1 < course.lessons.length) {
            const nextLesson = course.lessons[currentIndex + 1];
            vscode.commands.executeCommand('scrim.playLesson', courseId, nextLesson.id);
          }
        }
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to mark lesson complete: ' + e.message);
      }
    }),

    vscode.commands.registerCommand('scrim.editCourseMetadata', async (item?: any) => {
      if (!item || !item.courseId) return;

      const courseUri = vscode.Uri.file(Paths.getCourseDir(item.courseId));
      const manifestUri = vscode.Uri.joinPath(courseUri, 'course.json');
      let currentMeta: any = {};
      try {
        const content = await vscode.workspace.fs.readFile(manifestUri);
        currentMeta = JSON.parse(Buffer.from(content).toString('utf-8'));
      } catch {}

      const desc = await vscode.window.showInputBox({ 
        prompt: 'Enter course description',
        value: currentMeta.description || ''
      });
      if (desc === undefined) return;

      const tagsStr = await vscode.window.showInputBox({ 
        prompt: 'Enter tags (comma separated)',
        value: (currentMeta.tags || []).join(', ')
      });
      if (tagsStr === undefined) return;
      const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

      const level = await vscode.window.showQuickPick(['beginner', 'intermediate', 'advanced'], { 
        placeHolder: 'Select level'
      });
      if (!level) return;

      try {
        await apiClient.request('PUT', `/courses/${item.courseId}`, { description: desc, tags, level });
        
        // Update local manifest
        currentMeta.description = desc;
        currentMeta.tags = tags;
        currentMeta.level = level;
        await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(JSON.stringify(currentMeta, null, 2), 'utf-8'));
        
        myCoursesProvider.refresh();
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to update course metadata: ' + e.message);
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

    vscode.commands.registerCommand('scrim.moveLessonDown', async (item?: any) => {
      if (!item || !item.courseId || !item.lessonId) return;
      try {
        const course = await apiClient.getCourse(item.courseId);
        const idx = course.lessons.findIndex(l => l.id === item.lessonId);
        if (idx !== -1 && idx < course.lessons.length - 1) {
          const newOrder = [...course.lessons];
          [newOrder[idx+1], newOrder[idx]] = [newOrder[idx], newOrder[idx+1]];
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
      // Search all workspace folders for one ending with 'starter'
      const wsFolders = vscode.workspace.workspaceFolders || [];
      for (const wsFolder of wsFolders) {
        if (path.basename(wsFolder.uri.fsPath) === 'starter') {
          lessonDir = path.dirname(wsFolder.uri.fsPath);
          break;
        }
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
            // Traverse up to find the lesson directory (which contains lesson.json)
            const fs = require('fs') as typeof import('fs');
            let current = path.dirname(fsPath);
            while (current !== path.dirname(current)) {
              if (fs.existsSync(path.join(current, 'lesson.json'))) {
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

      const lessonTitle = session.lessonMeta?.title || 'this lesson';
      const confirm = await vscode.window.showInformationMessage(
        `Ready to record "${lessonTitle}"? This will open a browser for screen capture.`,
        'Start Recording', 'Cancel'
      );
      if (confirm !== 'Start Recording') return;

      const urlChoice = await vscode.window.showQuickPick([
        { label: 'http://localhost:3000', description: 'Default React/Vite app' },
        { label: 'http://localhost:5173', description: 'Vite default port' },
        { label: 'Custom URL...', description: 'Enter a custom preview URL' },
        { label: 'No browser preview', description: 'Do not show live preview in VS Code' }
      ], { placeHolder: 'Select browser preview URL to show in VS Code' });
      if (!urlChoice) return;

      let previewUrl = urlChoice.label;
      if (urlChoice.label === 'Custom URL...') {
        const customUrl = await vscode.window.showInputBox({ prompt: 'Enter custom URL', value: 'http://' });
        if (!customUrl) return;
        previewUrl = customUrl;
      }
      
      const fs = require('fs');
      if (!fs.existsSync(path.join(lessonDir, 'starter'))) {
        vscode.window.showErrorMessage('The selected lesson directory is invalid (missing "starter" folder).');
        return;
      }
      
      recorder = new Recorder(session, lessonDir);
      
      // Start recording
      await recorder.start(context);
      vscode.commands.executeCommand('setContext', 'scrim.isRecording', true);
      vscode.window.showInformationMessage(`Recording started for "${lessonTitle}".`);
      if (previewUrl !== 'No browser preview') {
        browserPanel.showLive(previewUrl);
      }
    }),

    
    vscode.commands.registerCommand('scrim.resume', async () => {
      // Resume playback after a fork or challenge
      if (session.playerState === 'FORKED' || session.playerState === 'CHALLENGE') {
        stateManager.transition('PLAYING');
      }
    }),
    vscode.commands.registerCommand('scrim.stopRecording', async () => {
      if (!session.isRecording || !recorder) return;
      vscode.commands.executeCommand('setContext', 'scrim.isRecording', false);
      const summary = await recorder.stop();
      recorder.dispose();
      recorder = undefined;
      const durationStr = ScrimSession.formatTime(summary.durationMs);
      vscode.window.showInformationMessage(`✅ Recording saved! Duration: ${durationStr} | ${summary.eventCount} code events | Audio: ${summary.hasAudio?'✓':'✗'} | Screen: ${summary.hasScreen?'✓':'✗'}`);
      myCoursesProvider.refresh();
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
        prompt: 'Test command to verify challenge (leave empty for manual check)',
        placeHolder: 'e.g. npm test or bun test'
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
              const fs = require('fs') as typeof import('fs');
              let current = path.dirname(fsPath);
              while (current !== path.dirname(current)) {
                if (fs.existsSync(path.join(current, 'lesson.json'))) {
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
          const fs = require('fs') as typeof import('fs');
          let current = path.dirname(fsPath);
          while (current !== path.dirname(current)) {
            if (fs.existsSync(path.join(current, 'lesson.json'))) {
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

      const fs = require('fs') as typeof import('fs');

      // Pre-publish validation
      const scrimFile = path.join(lessonDir, 'lesson.scrim');
      if (!fs.existsSync(scrimFile)) {
        vscode.window.showErrorMessage('Record a lesson first before publishing.');
        return;
      }
      const webmPath = path.join(lessonDir, 'screen.webm');
      const mp4Path = path.join(lessonDir, 'screen.mp4');
      if (fs.existsSync(webmPath) && !fs.existsSync(mp4Path)) {
        vscode.window.showWarningMessage('Screen recording is still transcoding. Please wait a moment before publishing.');
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

          const https = require('https');
          const http = require('http');

          const uploadFile = (filePath: string, urlStr: string, name: string) => {
            return new Promise<void>((resolve, reject) => {
              if (!fs.existsSync(filePath)) {
                resolve();
                return;
              }
              const stats = fs.statSync(filePath);
              const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
              progress.report({ message: `Uploading ${name} (${sizeMb} MB)...` });
              
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

          await uploadFile(path.join(lessonDir, 'lesson.scrim'), urls.scrim_url, 'lesson.scrim');
          await uploadFile(path.join(lessonDir, 'audio.ogg'), urls.audio_url, 'audio.ogg');
          await uploadFile(path.join(lessonDir, 'webcam.mp4'), urls.video_url, 'webcam video');
          await uploadFile(path.join(lessonDir, 'screen.mp4'), urls.screen_url, 'screen recording');

          progress.report({ message: 'Marking as published...' });
          await apiClient.publishLesson(lessonId);

          vscode.window.showInformationMessage('Lesson published successfully!');
        } catch (e: any) {
          vscode.window.showErrorMessage('Failed to publish lesson: ' + e.message);
        }
      });
    })
  );

  // If we are currently in a fork workspace, automatically activate Nix terminal
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const fs = require('fs') as typeof import('fs');
    if (fs.existsSync(path.join(rootPath, '.fork-meta.json'))) {
      const { NixManager } = require('./workspace/NixManager');
      const nix = new NixManager();
      nix.activate(rootPath);
    }
  }
}

export function deactivate() {}
