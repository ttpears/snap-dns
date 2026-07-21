// backend/src/middleware/__tests__/rateLimiter.principalKey.test.ts
// The rate-limit key must identify the principal so bearer-token traffic is
// throttled per token (not lumped into a shared per-IP bucket) and sessions are
// throttled per user.
import crypto from 'crypto';
import { principalKey } from '../rateLimiter';

// Minimal request shape; principalKey only reads session/headers/ip.
const req = (over: Record<string, unknown>): any => ({ headers: {}, ...over });

describe('principalKey', () => {
  it('keys an authenticated session by user id', () => {
    expect(principalKey(req({ session: { userId: 'u1' }, ip: '10.0.0.1' }))).toBe('user:u1');
  });

  it('keys a bearer API token by a stable hash fingerprint (not the raw token)', () => {
    const raw = 'sdns_' + 'a'.repeat(40);
    const expected = 'token:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const key = principalKey(req({ headers: { authorization: 'Bearer ' + raw }, ip: '10.0.0.1' }));
    expect(key).toBe(expected);
    expect(key).not.toContain(raw); // never leak the raw token into the key
  });

  it('gives two different tokens different buckets', () => {
    const a = principalKey(req({ headers: { authorization: 'Bearer sdns_' + 'a'.repeat(40) } }));
    const b = principalKey(req({ headers: { authorization: 'Bearer sdns_' + 'b'.repeat(40) } }));
    expect(a).not.toBe(b);
  });

  it('falls back to client IP when unauthenticated', () => {
    expect(principalKey(req({ ip: '203.0.113.5' }))).toBe('203.0.113.5');
    // A non-sdns bearer header is not a token principal → still IP.
    expect(principalKey(req({ headers: { authorization: 'Bearer garbage' }, ip: '203.0.113.5' }))).toBe('203.0.113.5');
  });
});
