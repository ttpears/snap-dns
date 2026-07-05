// backend/src/services/__tests__/ssoStateStore.test.ts
// Unit tests for the session-backed SSO state store: put/consume, CSRF mismatch
// rejection, single-use semantics, and expiry. Uses a plain object as the
// session stub (no express-session runtime needed).
import {
  putState,
  consumeState,
  SSOStateError,
  SSOStateSession,
  SSO_STATE_TTL_MS,
} from '../ssoStateStore';
import { PendingSSOState } from '../../types/sso';

function makePending(overrides: Partial<PendingSSOState> = {}): PendingSSOState {
  return {
    state: 'a'.repeat(64),
    nonce: 'b'.repeat(64),
    redirectUri: 'https://app.example.com/api/auth/sso/callback',
    timestamp: 1_000_000,
    ...overrides,
  };
}

describe('ssoStateStore', () => {
  it('putState stashes the pending state on the session', () => {
    const session: SSOStateSession = {};
    const pending = makePending();
    putState(session, pending);
    expect(session.ssoState).toEqual(pending);
  });

  it('consumeState returns the pending state on a matching token', () => {
    const pending = makePending();
    const session: SSOStateSession = { ssoState: pending };
    const result = consumeState(session, pending.state, pending.timestamp + 1000);
    expect(result).toEqual(pending);
  });

  it('is single-use: a matched state is cleared and cannot be replayed', () => {
    const pending = makePending();
    const session: SSOStateSession = { ssoState: pending };

    consumeState(session, pending.state, pending.timestamp + 1000);
    expect(session.ssoState).toBeUndefined();

    expect(() => consumeState(session, pending.state, pending.timestamp + 1000)).toThrow(
      SSOStateError
    );
  });

  it('rejects a mismatched state (CSRF protection) and still burns the stored value', () => {
    const pending = makePending();
    const session: SSOStateSession = { ssoState: pending };

    try {
      consumeState(session, 'c'.repeat(64), pending.timestamp + 1000);
      fail('expected consumeState to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SSOStateError);
      expect((err as SSOStateError).code).toBe('MISMATCH');
    }
    // Single-use even on failure: a captured state cannot be retried.
    expect(session.ssoState).toBeUndefined();
  });

  it('rejects when no state is pending on the session', () => {
    const session: SSOStateSession = {};
    try {
      consumeState(session, 'a'.repeat(64));
      fail('expected consumeState to throw');
    } catch (err) {
      expect((err as SSOStateError).code).toBe('MISSING');
    }
  });

  it('rejects a non-string supplied state', () => {
    const pending = makePending();
    const session: SSOStateSession = { ssoState: pending };
    try {
      consumeState(session, undefined, pending.timestamp + 1000);
      fail('expected consumeState to throw');
    } catch (err) {
      expect((err as SSOStateError).code).toBe('MISMATCH');
    }
  });

  it('rejects an expired state token', () => {
    const pending = makePending();
    const session: SSOStateSession = { ssoState: pending };
    const now = pending.timestamp + SSO_STATE_TTL_MS + 1;
    try {
      consumeState(session, pending.state, now);
      fail('expected consumeState to throw');
    } catch (err) {
      expect((err as SSOStateError).code).toBe('EXPIRED');
    }
  });

  it('accepts a token right at the TTL boundary', () => {
    const pending = makePending();
    const session: SSOStateSession = { ssoState: pending };
    const now = pending.timestamp + SSO_STATE_TTL_MS;
    expect(() => consumeState(session, pending.state, now)).not.toThrow();
  });
});
