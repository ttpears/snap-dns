// backend/src/services/ssoStateStore.ts
// Session-backed store for the OAuth2 authorization-code-flow CSRF `state`
// (and its bound `nonce`). Replaces the former process-global in-memory Map,
// which broke across multiple backend instances and lost in-flight logins on
// restart. State now lives on the express session, so it survives restarts,
// works behind a load balancer, and is naturally scoped to one browser session.
//
// Semantics preserved from the previous implementation:
//   - CSRF protection: a callback whose `state` is missing or does not match the
//     value issued at /signin is rejected.
//   - Single-use: the pending state is cleared on the first consume attempt
//     (success OR failure), so a captured `state` cannot be replayed.
import crypto from 'crypto';
import { PendingSSOState } from '../types/sso';

// Minimal session shape we depend on. Accepting an interface (rather than the
// full express-session Session) keeps this module unit-testable with a plain
// object stub.
export interface SSOStateSession {
  ssoState?: PendingSSOState;
}

// In-flight logins older than this are treated as expired.
export const SSO_STATE_TTL_MS = 5 * 60 * 1000;

export type SSOStateErrorCode = 'MISSING' | 'MISMATCH' | 'EXPIRED';

/** Thrown by consumeState when validation fails; carries a machine code. */
export class SSOStateError extends Error {
  constructor(public readonly code: SSOStateErrorCode, message: string) {
    super(message);
    this.name = 'SSOStateError';
  }
}

/**
 * Persist the pending SSO state on the session at /signin. Writing to the
 * session marks it dirty, so express-session issues the cookie even with
 * saveUninitialized:false.
 */
export function putState(session: SSOStateSession, pending: PendingSSOState): void {
  session.ssoState = pending;
}

/** Constant-time comparison that never throws on length/shape mismatch. */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validate and consume the pending SSO state at /callback.
 *
 * Single-use is enforced by clearing session.ssoState up front, before any
 * validation branch, so every code path (match, mismatch, expiry) burns the
 * stored value exactly once.
 *
 * @throws SSOStateError when no state is pending (MISSING), the supplied state
 *   does not match (MISMATCH), or the pending state has expired (EXPIRED).
 */
export function consumeState(
  session: SSOStateSession,
  suppliedState: unknown,
  now: number = Date.now()
): PendingSSOState {
  const pending = session.ssoState;
  // Burn the stored value first — single-use regardless of outcome.
  delete session.ssoState;

  if (!pending) {
    throw new SSOStateError('MISSING', 'No pending SSO state on session');
  }

  if (typeof suppliedState !== 'string' || !safeEquals(pending.state, suppliedState)) {
    throw new SSOStateError('MISMATCH', 'SSO state token mismatch');
  }

  if (now - pending.timestamp > SSO_STATE_TTL_MS) {
    throw new SSOStateError('EXPIRED', 'SSO state token expired');
  }

  return pending;
}
