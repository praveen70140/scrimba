import * as vscode from 'vscode';
import * as path from 'path';
import { CatalogViewProvider } from './ui/CatalogView';
import { MyCoursesViewProvider } from './ui/MyCoursesView';
import { MyForksViewProvider } from './ui/MyForksView';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { ScrimFS } from './core/ScrimFS';
import { ScrimSession } from './core/ScrimSession';
import { TerminalProxy } from './recorder/TerminalProxy';
import { MediaRecorder } from './recorder/MediaRecorder';
import { WebviewManager } from './preview/WebviewManager';
import { Paths } from './utils/Paths';
import { EventRecorder } from './recorder/EventRecorder';

export function activate(context: vscode.ExtensionContext) {
  console.log('Scrimba Clone Extension activated');

  const scrimFs = new ScrimFS();
  const mediaRecorder = new MediaRecorder();
  const webviewManager = new WebviewManager();
  let eventRecorder: EventRecorder | undefined;
  let activeTerminalProxy: TerminalProxy | undefined;

  // Register Virtual File System
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('scrim', scrimFs, { isCaseSensitive: true, isReadonly: true })
  );

  const catalogProvider = new CatalogViewProvider();
  const myCoursesProvider = new MyCoursesViewProvider();
  const myForksProvider = new MyForksViewProvider();

  // Register Tree Views
  vscode.window.registerTreeDataProvider('scrim.catalog', catalogProvider);
  vscode.window.registerTreeDataProvider('scrim.myCourses', myCoursesProvider);
  vscode.window.registerTreeDataProvider('scrim.myForks', myForksProvider);

  // Register all Commands
  context.subscriptions.push(

    // ── New Course ──────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.newCourse', async () => {
      const title = await vscode.window.showInputBox({
        prompt: 'Course title',
        placeHolder: 'e.g. Intro to TypeScript'
      });
      if (!title) { return; }
      const courseId = 'course-' + Date.now();
      await WorkspaceManager.initCourse(courseId, { id: courseId, title });
      myCoursesProvider.refresh();
      vscode.window.showInformationMessage(`Created course: ${title}`);
    }),

    // ── New Lesson ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.newLesson', async () => {
      // Pick an existing course
      const coursesDir = Paths.getBaseDir();
      const fs = require('fs') as typeof import('fs');
      let courseDirs: string[] = [];
      try {
        courseDirs = fs.readdirSync(path.join(coursesDir, 'courses'))
          .filter((d: string) => fs.statSync(path.join(coursesDir, 'courses', d)).isDirectory());
      } catch { /* no courses yet */ }

      if (courseDirs.length === 0) {
        vscode.window.showWarningMessage('No courses found. Create a course first with "Scrim: New Course".');
        return;
      }

      const courseId = await vscode.window.showQuickPick(courseDirs, {
        placeHolder: 'Select the course this lesson belongs to'
      });
      if (!courseId) { return; }

      const title = await vscode.window.showInputBox({
        prompt: 'Lesson title',
        placeHolder: 'e.g. Variables and Types'
      });
      if (!title) { return; }

      const lessonId = 'lesson-' + Date.now();
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);

      // Write a starter index.js so the lesson workspace isn't empty
      const starterFile = vscode.Uri.joinPath(starterUri, 'index.js');
      await vscode.workspace.fs.writeFile(starterFile, Buffer.from(`// ${title}\nconsole.log('Hello, world!');\n`, 'utf-8'));

      myCoursesProvider.refresh();
      await WorkspaceManager.openEditable(starterUri);
      vscode.window.showInformationMessage(`Lesson "${title}" created! Press "Scrim: Start Recording" when ready.`);
    }),

    // ── Start Recording ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.startRecording', async () => {
      // Guard: stop any existing session before starting a new one
      if (eventRecorder) {
        const yes = await vscode.window.showWarningMessage(
          'A recording session is already active. Stop it and start a new one?',
          'Yes', 'No'
        );
        if (yes !== 'Yes') { return; }
        eventRecorder.stop();
        eventRecorder = undefined;
        activeTerminalProxy?.dispose();
        activeTerminalProxy = undefined;
      }

      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (!wsFolder) {
        vscode.window.showErrorMessage('Open a lesson workspace first before recording.');
        return;
      }
      const workspaceRoot = wsFolder.uri.fsPath;

      await mediaRecorder.startRecording('mock-lesson-' + Date.now());

      // Start event recorder
      eventRecorder = new EventRecorder();
      eventRecorder.start();

      // Start terminal proxy
      activeTerminalProxy = new TerminalProxy(workspaceRoot);
      activeTerminalProxy.show();
      context.subscriptions.push(activeTerminalProxy);

      vscode.window.showInformationMessage('🔴 Recording started! Code away...');
    }),

    // ── Stop Recording ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.stopRecording', async () => {
      if (!eventRecorder) {
        vscode.window.showWarningMessage('No recording session is active.');
        return;
      }
      await mediaRecorder.stopRecording();

      const events = eventRecorder.stop();
      eventRecorder = undefined;

      // Dispose terminal proxy so repeated sessions don't stack up
      activeTerminalProxy?.dispose();
      activeTerminalProxy = undefined;

      vscode.window.showInformationMessage(`⏹ Recording stopped. Captured ${events.length} events.`);
    }),

    // ── Mark Chapter ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.markChapter', async () => {
      if (!eventRecorder?.getEvents) {
        vscode.window.showWarningMessage('Start recording first before marking a chapter.');
        return;
      }
      const label = await vscode.window.showInputBox({ prompt: 'Chapter label', placeHolder: 'e.g. Intro' });
      if (!label) { return; }
      eventRecorder.pushEvent((t) => ({ t, type: 'chapter', title: label, description: '' }));
      vscode.window.showInformationMessage(`Chapter marked: "${label}"`);
    }),

    // ── Add Challenge ────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.addChallenge', async () => {
      if (!eventRecorder?.getEvents) {
        vscode.window.showWarningMessage('Start recording first before adding a challenge.');
        return;
      }
      const prompt = await vscode.window.showInputBox({
        prompt: 'Challenge prompt (Markdown)',
        placeHolder: 'e.g. Make `/api` return `{ data: [] }` as JSON.'
      });
      if (!prompt) { return; }
      const testCmd = await vscode.window.showInputBox({
        prompt: 'Test command (leave empty for manual check)',
        placeHolder: 'e.g. node test.js'
      });
      const challengeId = 'ch-' + Date.now();
      eventRecorder.pushEvent((t) => ({
        t, type: 'challenge',
        id: challengeId,
        prompt,
        hint: '',
        test_cmd: testCmd || '',
        time_limit_s: null
      }));
      vscode.window.showInformationMessage('Challenge added to recording.');
    }),

    // ── Preview Lesson ────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.previewLesson', () => {
      webviewManager.showBrowser(context, 'http://localhost:3000');
    }),

    // ── Publish Lesson ────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.publishLesson', async () => {
      vscode.window.showInformationMessage('Publishing lesson to backend… (not yet wired to API)');
    }),

    // ── Fork ─────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.fork', async () => {
      const wsFolder = vscode.workspace.workspaceFolders?.[0];
      if (!wsFolder) {
        vscode.window.showErrorMessage('Open a lesson workspace before forking.');
        return;
      }
      // Derive lessonId from the workspace folder name
      const lessonId = path.basename(wsFolder.uri.fsPath);
      const forkId = 'fork_' + ScrimSession.formatTime(Date.now() % 3600000).replace(':', 'm') + 's_' + Math.random().toString(36).slice(2, 6);

      // Use RelativePattern to restrict search strictly to this workspace folder
      // (prevents picking up files from other roots in a multi-root workspace)
      const pattern = new vscode.RelativePattern(wsFolder, '**/*');
      const files: Record<string, string> = {};
      const allFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      for (const f of allFiles) {
        const rel = path.relative(wsFolder.uri.fsPath, f.fsPath);
        // Extra guard: skip anything that escaped the folder (should not happen with RelativePattern)
        if (rel.startsWith('..')) { continue; }
        const bytes = await vscode.workspace.fs.readFile(f);
        files[rel] = Buffer.from(bytes).toString('utf-8');
      }

      const forkUri = await WorkspaceManager.createFork(lessonId, forkId, files, Date.now());
      myForksProvider.refresh();
      await WorkspaceManager.openEditable(forkUri);
    }),


    // ── Resume ────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.resume', async () => {
      vscode.window.showInformationMessage('Resume playback — not yet wired to EventReplayer.');
    }),

    // ── Login ─────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.login', async () => {
      const email = await vscode.window.showInputBox({ prompt: 'Email' });
      if (!email) { return; }
      const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
      if (!password) { return; }
      vscode.window.showInformationMessage(`Logged in as ${email} (auth not yet wired to backend)`);
    }),

    // ── Logout ────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('scrim.logout', () => {
      vscode.window.showInformationMessage('Logged out.');
    })
  );
}

export function deactivate() {}
