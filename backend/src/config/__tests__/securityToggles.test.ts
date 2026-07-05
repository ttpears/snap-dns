// backend/src/config/__tests__/securityToggles.test.ts
import {
  resolveBooleanEnv,
  isRateLimitEnabled,
  isCookieSecure,
} from '../securityToggles';

describe('resolveBooleanEnv', () => {
  it('returns the default when unset or empty', () => {
    expect(resolveBooleanEnv(undefined, true)).toBe(true);
    expect(resolveBooleanEnv(undefined, false)).toBe(false);
    expect(resolveBooleanEnv('', true)).toBe(true);
    expect(resolveBooleanEnv('   ', true)).toBe(true);
  });

  it('treats false-like values as false regardless of default', () => {
    for (const v of ['false', 'FALSE', '0', 'no', 'off', ' Off ']) {
      expect(resolveBooleanEnv(v, true)).toBe(false);
    }
  });

  it('treats true-like values as true regardless of default', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on', ' On ']) {
      expect(resolveBooleanEnv(v, false)).toBe(true);
    }
  });

  it('falls back to the default for unrecognized values', () => {
    expect(resolveBooleanEnv('maybe', true)).toBe(true);
    expect(resolveBooleanEnv('maybe', false)).toBe(false);
  });
});

describe('isRateLimitEnabled', () => {
  it('defaults to enabled (secure) when unset, regardless of NODE_ENV', () => {
    expect(isRateLimitEnabled({})).toBe(true);
    expect(isRateLimitEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isRateLimitEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(isRateLimitEnabled({ NODE_ENV: 'production' })).toBe(true);
  });

  it('honors an explicit opt-out', () => {
    expect(isRateLimitEnabled({ RATE_LIMIT_ENABLED: 'false' })).toBe(false);
    expect(isRateLimitEnabled({ RATE_LIMIT_ENABLED: '0' })).toBe(false);
  });

  it('stays on for an explicit true', () => {
    expect(isRateLimitEnabled({ RATE_LIMIT_ENABLED: 'true' })).toBe(true);
  });
});

describe('isCookieSecure', () => {
  it('defaults to secure when unset, regardless of NODE_ENV', () => {
    expect(isCookieSecure({})).toBe(true);
    expect(isCookieSecure({ NODE_ENV: 'development' })).toBe(true);
    expect(isCookieSecure({ NODE_ENV: 'production' })).toBe(true);
  });

  it('honors an explicit opt-out for local HTTP dev', () => {
    expect(isCookieSecure({ COOKIE_SECURE: 'false' })).toBe(false);
  });

  it('stays secure for an explicit true', () => {
    expect(isCookieSecure({ COOKIE_SECURE: 'true' })).toBe(true);
  });
});
