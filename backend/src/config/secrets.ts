// backend/src/config/secrets.ts
// Centralized resolution of signing/encryption secrets with production fail-fast.
//
// A hardcoded, source-public secret is worthless: anyone who can read the repo
// can forge sessions or decrypt stored TSIG keys. So in production we refuse to
// start unless the operator supplies the secret via environment. In development
// and test we keep a deterministic fallback so local runs and the test suite
// work without extra setup (and so existing dev-encrypted data still decrypts).

// Dev/test-only fallbacks. NEVER relied upon in production (see requireSecret).
const DEV_SESSION_SECRET = 'dev-insecure-session-secret-do-not-use-in-production';
// Kept identical to the historical default so existing dev-encrypted TSIG keys
// remain decryptable in development after this change.
const DEV_TSIG_ENCRYPTION_KEY = 'change-this-32-char-key-in-prod!';

/**
 * Return `value` if it is a non-empty secret. Otherwise fail fast in production
 * (throw) and fall back to `devFallback` in any other environment.
 */
export function requireSecret(
  name: string,
  value: string | undefined,
  nodeEnv: string | undefined,
  devFallback: string
): string {
  if (value && value.trim().length > 0) {
    return value;
  }

  if (nodeEnv === 'production') {
    throw new Error(
      `${name} must be set to a non-empty value in production. ` +
        `Refusing to start with a fallback secret because it would allow ` +
        `session forgery / unprotected key storage. Set ${name} in the environment.`
    );
  }

  return devFallback;
}

/**
 * Resolve the express-session signing secret. Throws in production if unset.
 */
export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  return requireSecret('SESSION_SECRET', env.SESSION_SECRET, env.NODE_ENV, DEV_SESSION_SECRET);
}

/**
 * Resolve the TSIG-key-at-rest encryption secret. Throws in production if unset.
 */
export function resolveTsigEncryptionKey(env: NodeJS.ProcessEnv = process.env): string {
  return requireSecret(
    'TSIG_ENCRYPTION_KEY',
    env.TSIG_ENCRYPTION_KEY,
    env.NODE_ENV,
    DEV_TSIG_ENCRYPTION_KEY
  );
}
