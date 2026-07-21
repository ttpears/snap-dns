// backend/src/__tests__/integration/allowlistSemantics.integration.test.ts
// Empty-set semantics for the two per-user allowlists must be deny-by-default and
// consistent between the "use" path and the "list" path:
//   - allowedKeyIds: [] => the user may neither use nor even see any key's metadata
//   - allowedZones:  [] => the user may not access any zone
// Regression coverage for two footguns:
//   #1 allowedZones empty formerly meant "all zones" (inverted vs allowedKeyIds).
//   #2 listKeys skipped filtering on an empty list, so a key-less non-admin saw
//      every key's metadata (name/server/keyName/algorithm/zones) in the listing.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';
import { dnsService } from '../../services/dnsService';

const keyBody = (name: string, zones: string[]) => ({
  name,
  server: '192.0.2.53',
  keyName: `${name}.`,
  keyValue: 'c25hcC1kbnMtdGVzdC1rZXk=',
  algorithm: 'hmac-sha256',
  zones,
});

describe('Allowlist empty-set semantics (deny-by-default)', () => {
  let app: Express;
  let keyAId: string;
  let keyBId: string;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({ username: 'admin1', password: 'admin-pass-123', role: UserRole.ADMIN });
    // Admin creates two keys the non-admins may or may not be allowed to see.
    const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');
    const a = await agent.post('/api/tsig-keys').send(keyBody('key-a', ['example.com']));
    const b = await agent.post('/api/tsig-keys').send(keyBody('key-b', ['example.net']));
    keyAId = a.body.key.id;
    keyBId = b.body.key.id;
  });

  afterEach(() => jest.restoreAllMocks());

  describe('footgun #2: listKeys must not leak metadata to a key-less user', () => {
    it('a non-admin with empty allowedKeyIds sees no keys', async () => {
      await seedUser({
        username: 'nokeys',
        password: 'nokeys-pass-123',
        role: UserRole.EDITOR,
        allowedKeyIds: [],
      });
      const { agent } = await loginAgent(app, 'nokeys', 'nokeys-pass-123');
      const res = await agent.get('/api/tsig-keys');
      expect(res.status).toBe(200);
      expect(res.body.keys).toEqual([]);
    });

    it('a non-admin sees only their allowed keys', async () => {
      await seedUser({
        username: 'onekey',
        password: 'onekey-pass-123',
        role: UserRole.EDITOR,
        allowedKeyIds: [keyAId],
      });
      const { agent } = await loginAgent(app, 'onekey', 'onekey-pass-123');
      const res = await agent.get('/api/tsig-keys');
      expect(res.status).toBe(200);
      expect(res.body.keys.map((k: { id: string }) => k.id)).toEqual([keyAId]);
    });

    it('an admin still sees all keys', async () => {
      const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');
      const res = await agent.get('/api/tsig-keys');
      const ids = res.body.keys.map((k: { id: string }) => k.id);
      expect(ids).toEqual(expect.arrayContaining([keyAId, keyBId]));
    });
  });

  describe('footgun #1: empty allowedZones must deny (not grant) zone access', () => {
    it('a non-admin with empty allowedZones is denied a zone', async () => {
      await seedUser({
        username: 'nozones',
        password: 'nozones-pass-123',
        role: UserRole.EDITOR,
        allowedZones: [],
        allowedKeyIds: [keyAId],
      });
      const { agent } = await loginAgent(app, 'nozones', 'nozones-pass-123');
      const res = await agent.get('/api/zones/example.com');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('a non-admin with the zone explicitly allowed passes the zone gate', async () => {
      // Stub the DNS exec layer so a passing gate does not hit real BIND.
      jest.spyOn(dnsService, 'fetchZoneRecords').mockResolvedValue([] as never);
      await seedUser({
        username: 'okzone',
        password: 'okzone-pass-123',
        role: UserRole.EDITOR,
        allowedZones: ['example.com'],
        allowedKeyIds: [keyAId],
      });
      const { agent } = await loginAgent(app, 'okzone', 'okzone-pass-123');
      // keyId is now required to identify the view; keyA serves example.com.
      const res = await agent.get(`/api/zones/example.com?keyId=${keyAId}`);
      expect(res.status).toBe(200);
      expect(res.body.code).not.toBe('PERMISSION_DENIED');
    });

    it('an admin is unaffected by empty allowedZones', async () => {
      // admin1 has empty allowedZones but the admin role bypasses the gate.
      jest.spyOn(dnsService, 'fetchZoneRecords').mockResolvedValue([] as never);
      const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');
      // Admin may use any key; keyA serves example.com.
      const res = await agent.get(`/api/zones/example.com?keyId=${keyAId}`);
      expect(res.status).toBe(200);
    });
  });
});
