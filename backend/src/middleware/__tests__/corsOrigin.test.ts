// backend/src/middleware/__tests__/corsOrigin.test.ts
import { DEV_DEFAULT_ORIGINS, getAllowedOrigins, isOriginAllowed } from '../corsOrigin';

describe('getAllowedOrigins', () => {
  it('returns only ALLOWED_ORIGINS entries in production', () => {
    expect(getAllowedOrigins('production', 'https://dns.example.com,https://dns2.example.com'))
      .toEqual(['https://dns.example.com', 'https://dns2.example.com']);
  });

  it('returns an empty list in production when ALLOWED_ORIGINS is unset', () => {
    expect(getAllowedOrigins('production', undefined)).toEqual([]);
  });

  it('does not include dev defaults in production', () => {
    expect(getAllowedOrigins('production', 'https://dns.example.com'))
      .not.toContain('http://localhost:3000');
  });

  it('returns the known dev origins in development', () => {
    const origins = getAllowedOrigins('development', undefined);
    DEV_DEFAULT_ORIGINS.forEach(origin => expect(origins).toContain(origin));
  });

  it('merges ALLOWED_ORIGINS with dev defaults in development', () => {
    const origins = getAllowedOrigins('development', 'http://10.100.0.30:3001');
    expect(origins).toContain('http://10.100.0.30:3001');
    expect(origins).toContain('http://localhost:3000');
  });

  it('deduplicates ALLOWED_ORIGINS entries that repeat dev defaults', () => {
    const origins = getAllowedOrigins('development', 'http://localhost:3000');
    expect(origins.filter(o => o === 'http://localhost:3000')).toHaveLength(1);
  });

  it('treats test environment like development', () => {
    expect(getAllowedOrigins('test', undefined)).toEqual([...DEV_DEFAULT_ORIGINS]);
  });
});

describe('isOriginAllowed', () => {
  const allowed = getAllowedOrigins('development', undefined);

  it('allows requests without an Origin header', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });

  it('allows listed origins', () => {
    expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:3001', allowed)).toBe(true);
    expect(isOriginAllowed('http://frontend:3001', allowed)).toBe(true);
  });

  it('rejects unlisted origins in development', () => {
    expect(isOriginAllowed('http://evil.example.com', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:9999', allowed)).toBe(false);
  });

  it('requires an exact match (no prefix or scheme laxness)', () => {
    expect(isOriginAllowed('https://localhost:3000', allowed)).toBe(false);
    expect(isOriginAllowed('http://localhost:3000.evil.com', allowed)).toBe(false);
  });
});
