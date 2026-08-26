import * as vscode from 'vscode';
import { ApiClient } from './ApiClient';

const TOKEN_KEY = 'scrimba_clone_jwt';

export class Auth {
  constructor(
    private secretStorage: vscode.SecretStorage,
    private apiClient: ApiClient
  ) {}

  /**
   * Retrieves the stored JWT token.
   */
  public async getToken(): Promise<string | undefined> {
    return await this.secretStorage.get(TOKEN_KEY);
  }

  /**
   * Saves the JWT token and configures the API client to use it.
   */
  public async setToken(token: string): Promise<void> {
    await this.secretStorage.store(TOKEN_KEY, token);
    this.apiClient.setToken(token);
  }

  /**
   * Clears the stored JWT token and removes it from the API client.
   */
  public async clearToken(): Promise<void> {
    await this.secretStorage.delete(TOKEN_KEY);
    this.apiClient.setToken(undefined);
  }

  /**
   * Initializes the Auth state on extension activation.
   */
  public async init(): Promise<void> {
    const token = await this.getToken();
    if (token) {
      this.apiClient.setToken(token);
    }
  }

  /**
   * Checks if the user is currently logged in.
   */
  public async isLoggedIn(): Promise<boolean> {
    return !!(await this.getToken());
  }
}
