// backend/src/config/securityToggles.ts
// Explicit, default-secure toggles for security controls that were previously
// driven implicitly by NODE_ENV.
//
// The prior design silently disabled brute-force protection and secure cookies
// whenever NODE_ENV was not exactly 'production' -- and NODE_ENV defaults to
// 'development'. A production deployment that forgot to set NODE_ENV=production
// therefore ran with NO login rate limiting and NON-secure cookies.
//
// These toggles instead DEFAULT TO SECURE and require an explicit opt-out:
//   - RATE_LIMIT_ENABLED=false  disables rate limiting (for tests / local dev
//                               that legitimately fire many requests)
//   - COOKIE_SECURE=false       marks the session cookie non-Secure so it is
//                               sent over plain HTTP (for local HTTP dev)
// With no env set, both are ON regardless of NODE_ENV.

/**
 * Parse a boolean-ish env var. An unset/empty value yields `defaultValue`.
 * Only an explicit, case-insensitive false-like value ("false"/"0"/"no"/"off")
 * turns the control off; true-like values force it on; anything else falls back
 * to `defaultValue`.
 */
export function resolveBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '') {
    return defaultValue;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  return defaultValue;
}

/**
 * Whether API/login rate limiting is active. Default: ON (secure).
 * Set RATE_LIMIT_ENABLED=false to disable (tests / high-volume local dev).
 */
export function isRateLimitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveBooleanEnv(env.RATE_LIMIT_ENABLED, true);
}

/**
 * Whether the session cookie is marked Secure (HTTPS-only). Default: ON (secure).
 * Set COOKIE_SECURE=false for local HTTP dev, otherwise the browser will not send
 * the cookie over plain HTTP and login will appear to "not persist".
 */
export function isCookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveBooleanEnv(env.COOKIE_SECURE, true);
}
