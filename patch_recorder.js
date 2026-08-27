const fs = require('fs');
let rec = fs.readFileSync('extension/src/recorder/Recorder.ts', 'utf8');

const oldCode = `      meta: {
        id: lessonId,
        courseId: courseId,
        title: lessonTitle,
        duration_ms: duration,
        language_hint: 'javascript',
        runtime_hint: 'node >= 20',
      },`;

const newCode = `      meta: {
        id: lessonId,
        courseId: courseId,
        title: lessonTitle,
        duration_ms: duration,
        language_hint: (this.session as any).lessonMeta?.languageHint || 'javascript',
        runtime_hint: (this.session as any).lessonMeta?.runtimeHint || 'node >= 20',
      },`;

rec = rec.replace(oldCode, newCode);
fs.writeFileSync('extension/src/recorder/Recorder.ts', rec);
