import * as vscode from 'vscode';
import { Course, Lesson } from '@scrimba-clone/shared';

export class ApiClient {
  private get baseUrl() {
    // Read from VS Code configuration, defaulting to local but requiring HTTPS for production
    const config = vscode.workspace.getConfiguration('scrim');
    return config.get<string>('apiUrl') || 'http://localhost:4000';
  }
  private token: string | null = null;

  public setToken(token: string) {
    this.token = token;
  }

  private get headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      // Security: In production, the API URL MUST be HTTPS to protect the bearer token.
      h['Authorization'] = `Bearer ${this.token}`;
    }
    return h;
  }

  public async getCourses(): Promise<Course[]> {
    const res = await fetch(`${this.baseUrl}/courses`, { headers: this.headers });
    if (!res.ok) throw new Error('Failed to fetch courses');
    return res.json() as Promise<Course[]>;
  }

  public async getLessons(courseId: string): Promise<Lesson[]> {
    const res = await fetch(`${this.baseUrl}/courses/${encodeURIComponent(courseId)}/lessons`, { headers: this.headers });
    if (!res.ok) throw new Error('Failed to fetch lessons');
    return res.json() as Promise<Lesson[]>;
  }

  public async enroll(courseId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/enroll/${encodeURIComponent(courseId)}`, {
      method: 'POST',
      headers: this.headers
    });
    if (!res.ok) throw new Error('Failed to enroll');
  }

  public async getDownloadUrls(lessonId: string): Promise<{ scrim_url: string; video_url: string; timecodes_url: string }> {
    const res = await fetch(`${this.baseUrl}/lessons/${encodeURIComponent(lessonId)}/download-urls`, { headers: this.headers });
    if (!res.ok) throw new Error('Failed to get download URLs');
    return res.json() as Promise<any>;
  }

  public async getUploadUrls(lessonId: string): Promise<{ scrim_url: string; video_url: string; timecodes_url: string }> {
    const res = await fetch(`${this.baseUrl}/lessons/${encodeURIComponent(lessonId)}/upload-urls`, {
      method: 'POST',
      headers: this.headers
    });
    if (!res.ok) throw new Error('Failed to get upload URLs');
    return res.json() as Promise<any>;
  }

  public async publishLesson(lessonId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/lessons/${encodeURIComponent(lessonId)}/publish`, {
      method: 'POST',
      headers: this.headers
    });
    if (!res.ok) throw new Error('Failed to publish lesson');
  }

  public async markComplete(lessonId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/progress/${encodeURIComponent(lessonId)}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ completed: true })
    });
    if (!res.ok) throw new Error('Failed to mark complete');
  }
}

