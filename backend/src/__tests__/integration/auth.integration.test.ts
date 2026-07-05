// backend/src/__tests__/integration/auth.integration.test.ts
// HTTP-level authentication lifecycle: unauthenticated rejection, login issuing
// a session cookie, authenticated access, and logout destroying the session.
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';

describe('auth lifecycle (HTTP)', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({ username: 'alice', password: 'correct-horse', role: UserRole.ADMIN });
  });

  it('rejects an unauthenticated request to a protected route with 401', async () => {
    const res = await request(app).get('/api/tsig-keys');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NOT_AUTHENTICATED');
  });

  it('login with valid credentials sets a session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'correct-horse' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('snap-dns.sid');
  });

  it('rejects login with a wrong password (401 INVALID_CREDENTIALS, no cookie session)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('an authenticated agent can reach a protected route (200)', async () => {
    const { agent, res: loginRes } = await loginAgent(app, 'alice', 'correct-horse');
    expect(loginRes.status).toBe(200);

    const res = await agent.get('/api/tsig-keys');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('logout destroys the session so the next request is 401', async () => {
    const { agent } = await loginAgent(app, 'alice', 'correct-horse');

    // Confirm the session works before logout.
    const before = await agent.get('/api/tsig-keys');
    expect(before.status).toBe(200);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect(logout.body.success).toBe(true);

    const after = await agent.get('/api/tsig-keys');
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('NOT_AUTHENTICATED');
  });
});
