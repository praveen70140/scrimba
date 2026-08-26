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
  private request<T>(method: string, path: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}${path}`);
      const lib = url.protocol === 'https:' ? https : http;
      
      const req = lib.request(url, {
        method,
        headers: this.headers,
        agent: false // explicitly disable connection pooling / proxy agents
      }, (res) => {
        let data = '';
        // setEncoding ensures multi-byte UTF-8 chars never span chunks
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          console.log(`[ApiClient] ${method} ${path} -> ${res.statusCode} (data: ${data})`);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(data ? JSON.parse(data) : null); }
            catch (e) { reject(new Error('Invalid JSON response')); }
          } else {
            reject(new Error(`API Error: ${res.statusCode} ${res.statusMessage}`));
          }
        });
        // Handle response stream errors and premature close
        res.on('error', reject);
        res.on('close', () => {
          if (!res.complete) {
            reject(new Error('Response stream closed prematurely'));
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  public async login(email: string, password: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('POST', '/auth/login', { email, password });
  }

  public async register(email: string, username: string, password: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('POST', '/auth/register', { email, username, password });
  }

  public async getCourses(): Promise<Course[]> {
    return this.request<Course[]>('GET', '/courses');
  }

  public async getCourse(courseId: string): Promise<Course & { lessons: Lesson[] }> {
    return this.request<Course & { lessons: Lesson[] }>('GET', `/courses/${encodeURIComponent(courseId)}`);
  }

  public async getLessons(courseId: string): Promise<Lesson[]> {
    const course = await this.getCourse(courseId);
    return course.lessons;
  }

  public async enroll(courseId: string): Promise<void> {
    return this.request<void>('POST', `/enroll/${encodeURIComponent(courseId)}`);
  }

  public async getDownloadUrls(lessonId: string): Promise<{ scrim_url: string; video_url: string; timecodes_url: string }> {
    return this.request<{ scrim_url: string; video_url: string; timecodes_url: string }>('GET', `/lessons/${encodeURIComponent(lessonId)}/download`);
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


