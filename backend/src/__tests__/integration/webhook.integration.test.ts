// backend/src/__tests__/integration/webhook.integration.test.ts
// HTTP-level coverage of the webhook SSRF gate on POST /api/webhook/notify:
// unauthenticated is rejected, authenticated requests to blocked targets
// (localhost, 169.254.169.254 metadata) are refused before any outbound call,
// and an allowed target passes the guard and reaches fetch (which is mocked so
// no real network request is made).
import request from 'supertest';
import type { Express } from 'express';

// Mock node-fetch BEFORE importing the app so webhookService binds to the mock.
jest.mock('node-fetch', () => jest.fn());
import fetch from 'node-fetch';

import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';

const mockedFetch = fetch as unknown as jest.Mock;

function notifyBody(url: string) {
  return {
    config: { url, provider: 'slack' },
    payload: { text: 'integration-test notification' },
  };
}

describe('webhook SSRF gate (HTTP)', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({ username: 'hooker', password: 'hook-pass-123', role: UserRole.EDITOR });
  });

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ok',
    });
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/api/webhook/notify')
      .send(notifyBody('https://hooks.example.com/abc'));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NOT_AUTHENTICATED');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('blocks a localhost target (SSRF) without calling fetch', async () => {
    const { agent } = await loginAgent(app, 'hooker', 'hook-pass-123');
    const res = await agent
      .post('/api/webhook/notify')
      .send(notifyBody('http://localhost:9999/steal'));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('blocks the cloud metadata address 169.254.169.254 without calling fetch', async () => {
    const { agent } = await loginAgent(app, 'hooker', 'hook-pass-123');
    const res = await agent
      .post('/api/webhook/notify')
      .send(notifyBody('http://169.254.169.254/latest/meta-data/'));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('allows a public target and reaches the (mocked) fetch', async () => {
    const { agent } = await loginAgent(app, 'hooker', 'hook-pass-123');
    const res = await agent
      .post('/api/webhook/notify')
      .send(notifyBody('https://hooks.example.com/services/T000/B000/xyz'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0][0]).toBe('https://hooks.example.com/services/T000/B000/xyz');
  });
});
