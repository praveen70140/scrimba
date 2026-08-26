import * as vscode from 'vscode';
import { ScrimSession, PlayerState } from './ScrimSession';

export interface StateTransitionEvent {
  from: PlayerState;
  to: PlayerState;
  session: ScrimSession;
}

/**
 * StateManager enforces valid state transitions for the player state machine.
 *
 * Valid transitions:
 *   IDLE       → PLAYING
 *   PLAYING    → PAUSED | FORKED | CHALLENGE
 *   PAUSED     → PLAYING | FORKED
 *   FORKED     → PLAYING (resume) | CHALLENGE
 *   CHALLENGE  → PLAYING (pass/skip) | FORKED (auto-fork at challenge point)
 */
export class StateManager {
  private _onDidTransition = new vscode.EventEmitter<StateTransitionEvent>();
  public readonly onDidTransition = this._onDidTransition.event;

  private static VALID_TRANSITIONS: Record<PlayerState, PlayerState[]> = {
    IDLE:      ['PLAYING'],
    PLAYING:   ['PAUSED', 'FORKED', 'CHALLENGE'],
    PAUSED:    ['PLAYING', 'FORKED'],
    FORKED:    ['PLAYING', 'CHALLENGE'],
    CHALLENGE: ['PLAYING', 'FORKED'],
  };

  constructor(private session: ScrimSession) {}

  /**
   * Attempts a state transition. Throws if the transition is not valid.
   */
  public transition(to: PlayerState): void {
    const from = this.session.playerState;

    if (from === to) return; // no-op

    const allowed = StateManager.VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid state transition: ${from} → ${to}`);
    }

    this.session.playerState = to;
    this._onDidTransition.fire({ from, to, session: this.session });
  }

  /**
   * Checks if a given transition is valid without performing it.
   */
  public canTransition(to: PlayerState): boolean {
    const allowed = StateManager.VALID_TRANSITIONS[this.session.playerState];
    return allowed.includes(to);
  }

  public get currentState(): PlayerState {
    return this.session.playerState;
  }

  public dispose(): void {
    this._onDidTransition.dispose();
  }
}
