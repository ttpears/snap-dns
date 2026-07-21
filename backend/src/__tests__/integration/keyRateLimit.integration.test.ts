// backend/src/__tests__/integration/keyRateLimit.integration.test.ts
// The strict key-management limiter must throttle MUTATIONS only, never reads.
// Previously it was applied to the whole /api/tsig-keys router, so a burst of
// edits also 429'd GET /api/tsig-keys — which the UI rendered as
// "No TSIG keys configured", indistinguishable from the keys being wiped.
//
// Rate limiting is disabled by default in the suite (jest.setup.js); it is
// flipped ON here per file. This relies on each limiter's skip() re-evaluating
// the toggle per request (matching loginLimiter).
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';

const keyBody = {
  name: 'rl-key',
  server: '192.0.2.53',
  keyName: 'rl-key.',
  keyValue: 'c25hcC1kbnMtdGVzdC1rZXk=',
  algorithm: 'hmac-sha256',
  zones: ['example.com'],
};

describe('TSIG key management rate limiting (HTTP)', () => {
  let app: Express;
  const original = process.env.RATE_LIMIT_ENABLED;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    app = buildTestApp();
    // Distinct principals so each test gets its own limiter bucket.
    await seedUser({ username: 'rlreader', password: 'reader-pass-123', role: UserRole.ADMIN });
    await seedUser({ username: 'rlwriter', password: 'writer-pass-123', role: UserRole.ADMIN });
  });

  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = original;
  });

  it('does not throttle reads (list) with the strict key-mutation limiter', async () => {
    const { agent } = await loginAgent(app, 'rlreader', 'reader-pass-123');
    // Fire more reads than the mutation cap (30). If reads shared that bucket
    // the 31st would 429; they must all succeed (reads use the general limiter).
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const res = await agent.get('/api/tsig-keys');
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it('still throttles key mutations once the cap (30) is exceeded (429)', async () => {
    const { agent } = await loginAgent(app, 'rlwriter', 'writer-pass-123');
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) {
      const res = await agent.post('/api/tsig-keys').send({ ...keyBody, name: `rl-${i}` });
      statuses.push(res.status);
    }
    // At most 30 creations succeed; a later mutation is blocked with 429.
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(30);
    expect(statuses).toContain(429);
  });
});
