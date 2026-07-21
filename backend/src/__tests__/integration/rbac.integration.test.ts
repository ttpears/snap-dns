// backend/src/__tests__/integration/rbac.integration.test.ts
// HTTP-level RBAC enforcement on mutation routes. A viewer is blocked (403) from
// TSIG-key creation and zone-record writes; an editor / admin passes. The DNS
// exec layer (dig/nsupdate) and the zone's TSIG key lookup are stubbed so these
// stay pure route/auth tests with no real BIND.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';
import { dnsService } from '../../services/dnsService';
import { tsigKeyService } from '../../services/tsigKeyService';

const validKeyBody = {
  name: 'test-key',
  server: '192.0.2.53',
  keyName: 'test-key.',
  keyValue: 'c25hcC1kbnMtdGVzdC1rZXk=',
  algorithm: 'hmac-sha256',
  zones: ['example.com'],
};

const validRecord = {
  name: 'www.example.com',
  type: 'A',
  value: '192.0.2.10',
  ttl: 3600,
  class: 'IN',
};

describe('RBAC on mutation routes (HTTP)', () => {
  let app: Express;
  let editorKeyId: string;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({ username: 'viewer1', password: 'viewer-pass-123', role: UserRole.VIEWER });
    // A real key serving the zone; the write path now resolves the key by the
    // explicit keyId, so the editor must be granted it.
    const key = await tsigKeyService.createKey('seed', {
      name: 'rbac-key', server: '192.0.2.53', keyName: 'rbac-key.',
      keyValue: 'c25hcC1kbnMtdGVzdC1rZXk=', algorithm: 'hmac-sha256', zones: ['example.com'],
    });
    editorKeyId = key.id;
    // Grant the zone explicitly: allowedZones is deny-by-default (empty => no zones).
    await seedUser({ username: 'editor1', password: 'editor-pass-123', role: UserRole.EDITOR, allowedZones: ['example.com'], allowedKeyIds: [editorKeyId] });
  });

  describe('TSIG key creation', () => {
    it('blocks a viewer (403 READ_ONLY)', async () => {
      const { agent } = await loginAgent(app, 'viewer1', 'viewer-pass-123');
      const res = await agent.post('/api/tsig-keys').send(validKeyBody);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('READ_ONLY');
    });

    it('allows an editor (201 created)', async () => {
      const { agent } = await loginAgent(app, 'editor1', 'editor-pass-123');
      const res = await agent.post('/api/tsig-keys').send(validKeyBody);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.key.name).toBe('test-key');
      // The decrypted secret must never be returned to the client.
      expect(res.body.key.keyValue).toBeUndefined();
    });
  });

  describe('zone record write', () => {
    afterEach(() => jest.restoreAllMocks());

    it('blocks a viewer before any DNS work (403 READ_ONLY)', async () => {
      const addSpy = jest.spyOn(dnsService, 'addRecord');
      const { agent } = await loginAgent(app, 'viewer1', 'viewer-pass-123');

      const res = await agent
        .post('/api/zones/example.com/records')
        .send({ record: validRecord });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('READ_ONLY');
      // requireWriteAccess runs before the handler, so no nsupdate is attempted.
      expect(addSpy).not.toHaveBeenCalled();
    });

    it('lets an editor through the full guard chain to the DNS layer (200)', async () => {
      const addSpy = jest
        .spyOn(dnsService, 'addRecord')
        .mockResolvedValue({ success: true } as never);

      const { agent } = await loginAgent(app, 'editor1', 'editor-pass-123');
      const res = await agent
        .post('/api/zones/example.com/records')
        .send({ keyId: editorKeyId, record: validRecord });

      expect(res.status).toBe(200);
      expect(addSpy).toHaveBeenCalledTimes(1);
      // The resolved TSIG key config is what the exec layer receives.
      const [zoneArg, recordArg, keyConfigArg] = addSpy.mock.calls[0];
      expect(zoneArg).toBe('example.com');
      expect(recordArg).toMatchObject({ type: 'A', value: '192.0.2.10' });
      expect(keyConfigArg).toMatchObject({ id: editorKeyId, keyName: 'rbac-key.', server: '192.0.2.53' });
    });
  });
});
