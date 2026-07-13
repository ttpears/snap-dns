// backend/src/__tests__/integration/backupZoneAccess.integration.test.ts
// Creating a snapshot writes a per-zone file on disk. Without a zone-access check
// an authenticated editor could POST to arbitrarily many distinct :zone values,
// spawning unbounded files. The create route must enforce the same deny-by-default
// zone gate as the zone routes, so a snapshot can only be created for a zone the
// user may access.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';

const body = {
  records: [{ name: 'www.example.com', type: 'A', value: '192.0.2.10', ttl: 3600, class: 'IN' }],
  server: '192.0.2.53',
  type: 'manual',
  description: 'test',
};

describe('Snapshot creation zone-access gate (HTTP)', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({
      username: 'editorz',
      password: 'editor-pass-123',
      role: UserRole.EDITOR,
      allowedZones: ['example.com'],
    });
    await seedUser({ username: 'adminz', password: 'admin-pass-123', role: UserRole.ADMIN });
  });

  it('allows creating a snapshot for a zone the editor may access', async () => {
    const { agent } = await loginAgent(app, 'editorz', 'editor-pass-123');
    const res = await agent.post('/api/backups/zone/example.com').send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('denies creating a snapshot for a zone the editor may not access', async () => {
    const { agent } = await loginAgent(app, 'editorz', 'editor-pass-123');
    const res = await agent.post('/api/backups/zone/other.org').send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('lets an admin create a snapshot for any zone', async () => {
    const { agent } = await loginAgent(app, 'adminz', 'admin-pass-123');
    const res = await agent.post('/api/backups/zone/anything.example').send(body);
    expect(res.status).toBe(201);
  });
});
