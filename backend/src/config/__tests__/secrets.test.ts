// backend/src/config/__tests__/secrets.test.ts
import {
  requireSecret,
  resolveSessionSecret,
  resolveTsigEncryptionKey,
} from '../secrets';

describe('requireSecret', () => {
  it('returns the provided value when non-empty', () => {
    expect(requireSecret('X', 'real-secret', 'production', 'dev')).toBe('real-secret');
  });

  it('throws in production when value is undefined', () => {
    expect(() => requireSecret('SESSION_SECRET', undefined, 'production', 'dev')).toThrow(
      /SESSION_SECRET must be set/
    );
  });

  it('throws in production when value is empty or whitespace', () => {
    expect(() => requireSecret('X', '', 'production', 'dev')).toThrow(/must be set/);
    expect(() => requireSecret('X', '   ', 'production', 'dev')).toThrow(/must be set/);
  });

  it('falls back to the dev value outside production', () => {
    expect(requireSecret('X', undefined, 'development', 'dev-fallback')).toBe('dev-fallback');
    expect(requireSecret('X', undefined, 'test', 'dev-fallback')).toBe('dev-fallback');
    expect(requireSecret('X', undefined, undefined, 'dev-fallback')).toBe('dev-fallback');
  });
});

describe('resolveSessionSecret', () => {
  it('uses the env value when set', () => {
    expect(resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'abc' })).toBe('abc');
  });

  it('throws in production when unset', () => {
    expect(() => resolveSessionSecret({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
  });

  it('returns a dev fallback outside production', () => {
    expect(resolveSessionSecret({ NODE_ENV: 'development' })).toBeTruthy();
  });
});

describe('resolveTsigEncryptionKey', () => {
  it('uses the env value when set', () => {
    expect(
      resolveTsigEncryptionKey({ NODE_ENV: 'production', TSIG_ENCRYPTION_KEY: 'key' })
    ).toBe('key');
  });

  it('throws in production when unset', () => {
    expect(() => resolveTsigEncryptionKey({ NODE_ENV: 'production' })).toThrow(
      /TSIG_ENCRYPTION_KEY/
    );
  });

  it('returns a dev fallback outside production', () => {
    expect(resolveTsigEncryptionKey({ NODE_ENV: 'test' })).toBeTruthy();
  });
});
