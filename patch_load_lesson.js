const fs = require('fs');
let ext = fs.readFileSync('extension/src/extension.ts', 'utf8');

const oldCode = `      if (!lessonDir) {
        vscode.window.showErrorMessage('Open a lesson workspace or file first before recording, or start it from the My Courses view.');
        return;
      }`;

const newCode = `      if (!lessonDir) {
        vscode.window.showErrorMessage('Open a lesson workspace or file first before recording, or start it from the My Courses view.');
        return;
      }
      
      const fsNode = require('fs/promises');
      try {
        const metaStr = await fsNode.readFile(path.join(lessonDir, 'lesson.json'), 'utf8');
        session.lessonMeta = JSON.parse(metaStr);
      } catch (e) {
        console.warn('Failed to load lesson.json', e);
      }`;

ext = ext.replace(oldCode, newCode);
fs.writeFileSync('extension/src/extension.ts', ext);
