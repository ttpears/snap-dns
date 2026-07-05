// backend/src/helpers/session.ts
// Session helpers for authentication routes.

/** Minimal shape of the callback-style session APIs we wrap. */
export interface RegenerableSession {
  regenerate(callback: (err: unknown) => void): void;
}

/**
 * Promisify express-session's callback-style `regenerate`. Call this BEFORE
 * populating authenticated session fields so the pre-auth session id is
 * discarded and a fresh one is issued — mitigating session fixation. Fields set
 * after this resolves live on the new session, not the one that was wiped.
 */
export function regenerateSession(session: RegenerableSession): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    session.regenerate((err) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolve();
    });
  });
}
