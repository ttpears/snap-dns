// backend/src/__tests__/integration/passwordChange.integration.test.ts
// HTTP-level coverage of the forced-password-change enforcement, which had ZERO
// end-to-end coverage. A user carrying mustChangePassword=true is blocked from
// mutations (403 PASSWORD_CHANGE_REQUIRED) but CAN reach /change-password; once
// they change it, the flag clears (re-read from the store on the next request)
// and the same mutation succeeds.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';

const validKeyBody = {
  name: 'pw-flow-key',
  server: '192.0.2.53',
  keyName: 'pw-flow-key.',
  keyValue: 'c25hcC1kbnMtdGVzdC1rZXk=',
  algorithm: 'hmac-sha256',
  zones: ['example.com'],
};

describe('forced password change enforcement (HTTP)', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({
      username: 'mustchange',
      password: 'initial-pass-1',
      role: UserRole.ADMIN,
      mustChangePassword: true,
    });
  });

  it('login reports mustChangePassword=true', async () => {
    const { res } = await loginAgent(app, 'mustchange', 'initial-pass-1');
    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it('blocks a mutation with 403 PASSWORD_CHANGE_REQUIRED while the flag is set', async () => {
    const { agent } = await loginAgent(app, 'mustchange', 'initial-pass-1');
    const res = await agent.post('/api/tsig-keys').send(validKeyBody);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('allows the same session to reach /change-password, then unblocks mutations', async () => {
    const { agent } = await loginAgent(app, 'mustchange', 'initial-pass-1');

    // Blocked before changing.
    const blocked = await agent.post('/api/tsig-keys').send(validKeyBody);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // change-password is intentionally NOT behind requirePasswordCurrent.
    const changed = await agent.post('/api/auth/change-password').send({
      currentPassword: 'initial-pass-1',
      newPassword: 'brand-new-pass-2',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.success).toBe(true);

    // /session reflects the cleared flag immediately.
    const session = await agent.get('/api/auth/session');
    expect(session.body.authenticated).toBe(true);
    expect(session.body.user.mustChangePassword).toBe(false);

    // The mutation that was blocked now succeeds (flag re-read from the store).
    const allowed = await agent.post('/api/tsig-keys').send(validKeyBody);
    expect(allowed.status).toBe(201);
    expect(allowed.body.success).toBe(true);
  });
});
