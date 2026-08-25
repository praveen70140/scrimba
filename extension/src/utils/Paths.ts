import * as path from 'path';
import * as os from 'os';

export class Paths {
  static getBaseDir(): string {
    return path.join(os.homedir(), '.scrimba');
  }

  static getCoursesDir(): string {
    return path.join(this.getBaseDir(), 'courses');
  }

  static getCourseDir(courseId: string): string {
    return path.join(this.getCoursesDir(), courseId);
  }

  static getLessonDir(courseId: string, lessonId: string): string {
    return path.join(this.getCourseDir(courseId), lessonId);
  }

  static getStarterDir(courseId: string, lessonId: string): string {
    return path.join(this.getLessonDir(courseId, lessonId), 'starter');
  }

  static getCacheDir(lessonId: string): string {
    return path.join(this.getBaseDir(), 'cache', lessonId);
  }

  static getWorkspacesDir(): string {
    return path.join(this.getBaseDir(), 'workspaces');
  }

  static getLessonWorkspaceDir(lessonId: string): string {
    return path.join(this.getWorkspacesDir(), lessonId);
  }

  static getForksDir(lessonId: string): string {
    return path.join(this.getLessonWorkspaceDir(lessonId), 'forks');
  }

  static getForkDir(lessonId: string, forkId: string): string {
    return path.join(this.getForksDir(lessonId), forkId);
  }
}
