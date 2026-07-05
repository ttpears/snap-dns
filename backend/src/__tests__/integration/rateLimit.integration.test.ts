// backend/src/__tests__/integration/rateLimit.integration.test.ts
// HTTP-level coverage of the login brute-force limiter. The limiter's skip()
// re-evaluates RATE_LIMIT_ENABLED per request, so we flip it ON for this file
// (the suite default is OFF, set in jest.setup.js) and confirm that exceeding
// the 5-attempt window yields 429 RATE_LIMIT_EXCEEDED.
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, seedUser } from './testApp';
import { UserRole } from '../../types/auth';

describe('login rate limiting (HTTP)', () => {
  let app: Express;
  const original = process.env.RATE_LIMIT_ENABLED;

  beforeAll(async () => {
    // Enable rate limiting for this file only. The loginLimiter checks this on
    // every request; the module-load-captured general limiter stays disabled,
    // so only the login window is exercised here.
    process.env.RATE_LIMIT_ENABLED = 'true';
    app = buildTestApp();
    await seedUser({ username: 'ratelimited', password: 'rate-pass-123', role: UserRole.VIEWER });
  });

  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = original;
  });

  it('returns 429 once the login attempt limit (5) is exceeded', async () => {
    const statuses: number[] = [];
    // The 6th attempt within the window should be throttled.
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'ratelimited', password: 'wrong-password' });
      statuses.push(res.status);
    }

    // First five are processed (invalid credentials -> 401); the sixth is blocked.
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ratelimited', password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
