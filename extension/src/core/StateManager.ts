import * as vscode from 'vscode';
import { ScrimSession, PlayerState } from './ScrimSession';

export interface StateTransitionEvent {
  from: PlayerState;
  to: PlayerState;
  session: ScrimSession;
}

export class StateManager {
  private _onDidTransition = new vscode.EventEmitter<StateTransitionEvent>();
  public readonly onDidTransition = this._onDidTransition.event;

  private static readonly VALID_TRANSITIONS: Record<PlayerState, PlayerState[]> = {
    IDLE: ['PLAYING'],
    PLAYING: ['PAUSED', 'FORKED', 'CHALLENGE'],
    PAUSED: ['PLAYING', 'FORKED'],
    FORKED: ['PLAYING', 'CHALLENGE'],
    CHALLENGE: ['PLAYING', 'FORKED'],
  };

  constructor(private session: ScrimSession) {}

  public transition(to: PlayerState): void {
    const from = this.session.playerState;
    if (from === to) return;
    if (!StateManager.VALID_TRANSITIONS[from].includes(to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }
    this.session.playerState = to;
    this._onDidTransition.fire({ from, to, session: this.session });
  }

  /** Starts a fresh lesson session without making the caller fake transitions. */
  public reset(): void {
    const from = this.session.playerState;
    if (from === 'IDLE') return;
    this.session.playerState = 'IDLE';
    this._onDidTransition.fire({ from, to: 'IDLE', session: this.session });
  }

  public canTransition(to: PlayerState): boolean {
    return this.session.playerState === to || StateManager.VALID_TRANSITIONS[this.session.playerState].includes(to);
  }

  public get currentState(): PlayerState { return this.session.playerState; }
  public dispose(): void { this._onDidTransition.dispose(); }
}
