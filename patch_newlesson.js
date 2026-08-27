const fs = require('fs');
let ext = fs.readFileSync('extension/src/extension.ts', 'utf8');

const oldCode = `      const title = await vscode.window.showInputBox({ prompt: 'Lesson title' });
      if (!title) { return; }

      const lessonId = 'lesson-' + Date.now();
      session.lessonMeta = { id: lessonId, title, courseId, durationMs: 0 };
      
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);
      
      const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
      const metaUri = vscode.Uri.joinPath(lessonUri, 'lesson.json');
      await vscode.workspace.fs.writeFile(metaUri, Buffer.from(JSON.stringify({ title }, null, 2), 'utf-8'));`;

const newCode = `      const title = await vscode.window.showInputBox({ prompt: 'Lesson title' });
      if (!title) { return; }

      const languageHint = await vscode.window.showInputBox({ prompt: 'Language hint (e.g., javascript, python, rust)', value: 'javascript' }) || 'javascript';
      const runtimeHint = await vscode.window.showInputBox({ prompt: 'Runtime hint (e.g., node >= 20, python 3.12)', value: 'node >= 20' }) || 'node >= 20';

      const lessonId = 'lesson-' + Date.now();
      session.lessonMeta = { id: lessonId, title, courseId, durationMs: 0 };
      
      const starterUri = await WorkspaceManager.createStarterWorkspace(courseId, lessonId);
      
      const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
      const metaUri = vscode.Uri.joinPath(lessonUri, 'lesson.json');
      await vscode.workspace.fs.writeFile(metaUri, Buffer.from(JSON.stringify({ title, languageHint, runtimeHint }, null, 2), 'utf-8'));`;

ext = ext.replace(oldCode, newCode);
fs.writeFileSync('extension/src/extension.ts', ext);
