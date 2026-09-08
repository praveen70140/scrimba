import * as vscode from 'vscode';
import { Course, Lesson } from '@scrimba-clone/shared';
import * as http from 'http';
import * as https from 'https';

export class ApiClient {
  private get baseUrl() {
    const config = vscode.workspace.getConfiguration('scrim');
    return config.get<string>('apiUrl') || 'http://localhost:4000';
  }
  private token: string | null = null;
  private headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  /**
   * Sets the JWT token to be used for all authenticated requests.
   * Pass undefined to remove the token.
   */
  public setToken(token: string | undefined): void {
    if (token) {
      this.headers['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.headers['Authorization'];
    }
  }

  // Helper to bypass VS Code's proxy-patched fetch
  public request<T = any>(method: string, path: string, body?: any, requiresSession = true): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const lib = url.protocol === 'https:' ? https : http;
      
      const requestHeaders = { ...this.headers };
      let bodyData: string | undefined;
      
      if (body) {
        bodyData = JSON.stringify(body);
        requestHeaders['Content-Length'] = Buffer.byteLength(bodyData).toString();
      }

      const req = lib.request(url, {
        method,
        headers: requestHeaders,
        agent: false
      });

      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8');
          console.log(`[ApiClient] ${method} ${path} -> ${res.statusCode} (data length: ${data.length})`);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(data ? JSON.parse(data) : null); }
            catch (e) { reject(new Error('Invalid JSON response')); }
          } else if (res.statusCode === 401 && requiresSession) {
            vscode.window.showErrorMessage('Session expired. Please log in again.');
            vscode.commands.executeCommand('scrim.login');
            reject(new Error(`API Error: 401 Unauthorized`));
          } else {
            reject(new Error(`API Error: ${res.statusCode} ${res.statusMessage}`));
          }
        });
        res.on('error', reject);
        res.on('close', () => {
          if (!res.complete) {
            reject(new Error('Response stream closed prematurely'));
          }
        });
      });

      req.on('error', reject);
      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  public async login(email: string, password: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('POST', '/auth/login', { email, password }, false);
  }

  public async register(email: string, username: string, password: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('POST', '/auth/register', { email, username, password }, false);
  }

  public async getCourses(): Promise<Course[]> {
    const res = await this.request<{data: Course[]}>('GET', '/courses'); return res.data;
  }

  public async getCourse(courseId: string): Promise<Course & { lessons: Lesson[] }> {
    return this.request<Course & { lessons: Lesson[] }>('GET', `/courses/${encodeURIComponent(courseId)}`);
  }

  public async getLessons(courseId: string): Promise<Lesson[]> {
    const course = await this.getCourse(courseId);
    return course.lessons;
  }

  public async deleteCourse(courseId: string): Promise<void> {
    await this.request('DELETE', `/courses/${courseId}`);
  }

  public async createCourse(title: string): Promise<any> {
    return this.request('POST', '/courses', { title });
  }

  public async createLesson(courseId: string, title: string): Promise<any> {
    return this.request('POST', `/courses/${courseId}/lessons`, { title });
  }

  public async enroll(courseId: string): Promise<void> {
    return this.request<void>('POST', `/enroll/${encodeURIComponent(courseId)}`);
  }

  public async getDownloadUrls(lessonId: string): Promise<{ scrim_url: string | null; audio_url: string | null; video_url: string | null; screen_url: string | null }> {
    return this.request<{ scrim_url: string | null; audio_url: string | null; video_url: string | null; screen_url: string | null }>('GET', `/lessons/${encodeURIComponent(lessonId)}/download`);
  }

  public async getUploadUrls(lessonId: string): Promise<any> {
    return this.request<any>('POST', `/lessons/${encodeURIComponent(lessonId)}/upload-urls`);
  }

  public async publishLesson(lessonId: string): Promise<void> {
    return this.request<void>('POST', `/lessons/${encodeURIComponent(lessonId)}/publish`);
  }

  public async markComplete(lessonId: string): Promise<void> {
    return this.request<void>('POST', `/progress/${encodeURIComponent(lessonId)}`, { completed: true });
  }
}


