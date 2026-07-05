// backend/src/__tests__/integration/sessionRefresh.integration.test.ts
// HTTP-level coverage that privileges are re-read from the user store on every
// request (not trusted from the login-time session copy). An admin whose role is
// changed to viewer mid-session is blocked from mutations on the very next
// request, without re-authenticating.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';
import { userService } from '../../services/userService';

const validKeyBody = {
  name: 'demote-key',
  server: '192.0.2.53',
  keyName: 'demote-key.',
  keyValue: 'c25hcC1kbnMtdGVzdC1rZXk=',
  algorithm: 'hmac-sha256',
  zones: ['example.com'],
};

describe('session privilege refresh (HTTP)', () => {
  let app: Express;
  let userId: string;

  beforeAll(async () => {
    app = buildTestApp();
    userId = await seedUser({ username: 'demoteme', password: 'demote-pass-123', role: UserRole.ADMIN });
  });

  it('reflects a mid-session admin->viewer demotion on the next request', async () => {
    const { agent } = await loginAgent(app, 'demoteme', 'demote-pass-123');

    // As admin the mutation succeeds.
    const asAdmin = await agent.post('/api/tsig-keys').send(validKeyBody);
    expect(asAdmin.status).toBe(201);

    // Demote in the store WITHOUT touching the session cookie.
    await userService.updateUserRole(userId, UserRole.VIEWER);

    // Same cookie, next request: privileges are re-loaded, so the mutation is
    // now forbidden.
    const asViewer = await agent
      .post('/api/tsig-keys')
      .send({ ...validKeyBody, name: 'demote-key-2' });
    expect(asViewer.status).toBe(403);
    expect(asViewer.body.code).toBe('READ_ONLY');
  });
});
