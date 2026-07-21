// backend/src/__tests__/integration/splitView.integration.test.ts
// HTTP-level proof that zone operations target the EXPLICITLY selected TSIG key
// (i.e. the split-horizon "view"), not whichever key happens to list the zone
// name first. Two keys ("internal" and "external") both serve the same zone name
// on different servers; a request must carry keyId and be dispatched to that
// key's server. The DNS exec layer is stubbed so these stay pure route tests.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';
import { dnsService } from '../../services/dnsService';
import { tsigKeyService } from '../../services/tsigKeyService';

const SHARED_ZONE = 'split.example.com';

const oldRecord = { name: 'ns5.split.example.com', type: 'A', value: '192.0.2.5', ttl: 3600, class: 'IN' };
const newRecord = { name: 'ns5.split.example.com', type: 'A', value: '192.0.2.5', ttl: 300, class: 'IN' };

describe('Split-horizon: operations target the explicitly selected key (HTTP)', () => {
  let app: Express;
  let internalKeyId: string;
  let externalKeyId: string;
  let otherZoneKeyId: string;

  beforeAll(async () => {
    app = buildTestApp();

    // Two keys, same zone name, different servers — the split-view setup.
    const internal = await tsigKeyService.createKey('seed', {
      name: 'internal', server: '10.0.0.53', keyName: 'internal.', keyValue: 'aW50ZXJuYWwtc2VjcmV0',
      algorithm: 'hmac-sha256', zones: [SHARED_ZONE],
    });
    const external = await tsigKeyService.createKey('seed', {
      name: 'external', server: '203.0.113.53', keyName: 'external.', keyValue: 'ZXh0ZXJuYWwtc2VjcmV0',
      algorithm: 'hmac-sha256', zones: [SHARED_ZONE],
    });
    // A key the editor is allowed to use but which does NOT serve SHARED_ZONE.
    const other = await tsigKeyService.createKey('seed', {
      name: 'other', server: '198.51.100.53', keyName: 'other.', keyValue: 'b3RoZXItc2VjcmV0',
      algorithm: 'hmac-sha256', zones: ['other.example.com'],
    });
    internalKeyId = internal.id;
    externalKeyId = external.id;
    otherZoneKeyId = other.id;

    // Admin bypasses allowlists; editor is scoped to the zone + only the two
    // split-view keys and the "other" key (to test the serves-zone check).
    await seedUser({ username: 'admin1', password: 'admin-pass-123', role: UserRole.ADMIN });
    await seedUser({
      username: 'editor1', password: 'editor-pass-123', role: UserRole.EDITOR,
      allowedZones: [SHARED_ZONE], allowedKeyIds: [internalKeyId, otherZoneKeyId],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('PATCH with the internal keyId dispatches to the internal server', async () => {
    const spy = jest.spyOn(dnsService, 'updateRecord').mockResolvedValue({ success: true } as never);
    const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');

    const res = await agent
      .patch(`/api/zones/${SHARED_ZONE}/records`)
      .send({ keyId: internalKeyId, oldRecord, newRecord });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const keyConfig = spy.mock.calls[0][3];
    expect(keyConfig).toMatchObject({ id: internalKeyId, server: '10.0.0.53' });
  });

  it('PATCH with the external keyId dispatches to the external server (same zone name)', async () => {
    const spy = jest.spyOn(dnsService, 'updateRecord').mockResolvedValue({ success: true } as never);
    const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');

    const res = await agent
      .patch(`/api/zones/${SHARED_ZONE}/records`)
      .send({ keyId: externalKeyId, oldRecord, newRecord });

    expect(res.status).toBe(200);
    const keyConfig = spy.mock.calls[0][3];
    expect(keyConfig).toMatchObject({ id: externalKeyId, server: '203.0.113.53' });
  });

  it('rejects a write with no keyId and never touches DNS', async () => {
    const spy = jest.spyOn(dnsService, 'updateRecord');
    const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');

    const res = await agent
      .patch(`/api/zones/${SHARED_ZONE}/records`)
      .send({ oldRecord, newRecord });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_CONFIG');
    expect(spy).not.toHaveBeenCalled();
  });

  it('forbids a keyId the user is not allowed to use (403)', async () => {
    const spy = jest.spyOn(dnsService, 'updateRecord');
    // editor1 is NOT granted externalKeyId.
    const { agent } = await loginAgent(app, 'editor1', 'editor-pass-123');

    const res = await agent
      .patch(`/api/zones/${SHARED_ZONE}/records`)
      .send({ keyId: externalKeyId, oldRecord, newRecord });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a keyId that does not serve the requested zone', async () => {
    const spy = jest.spyOn(dnsService, 'updateRecord');
    const { agent } = await loginAgent(app, 'editor1', 'editor-pass-123');

    // otherZoneKeyId is allowed for the user but serves a different zone.
    const res = await agent
      .patch(`/api/zones/${SHARED_ZONE}/records`)
      .send({ keyId: otherZoneKeyId, oldRecord, newRecord });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_CONFIG');
    expect(spy).not.toHaveBeenCalled();
  });

  it('GET reads the zone via the server of the requested keyId', async () => {
    const spy = jest.spyOn(dnsService, 'fetchZoneRecords').mockResolvedValue([] as never);
    const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');

    const res = await agent.get(`/api/zones/${SHARED_ZONE}?keyId=${externalKeyId}`);

    expect(res.status).toBe(200);
    const keyConfig = spy.mock.calls[0][1];
    expect(keyConfig).toMatchObject({ id: externalKeyId, server: '203.0.113.53' });
  });

  it('batch dispatches to the explicitly selected key', async () => {
    const spy = jest.spyOn(dnsService, 'applyBatch').mockResolvedValue({ success: true } as never);
    const { agent } = await loginAgent(app, 'admin1', 'admin-pass-123');

    const res = await agent
      .post(`/api/zones/${SHARED_ZONE}/records/batch`)
      .send({ keyId: internalKeyId, changes: [{ op: 'update', oldRecord, newRecord }] });

    expect(res.status).toBe(200);
    const keyConfig = spy.mock.calls[0][2];
    expect(keyConfig).toMatchObject({ id: internalKeyId, server: '10.0.0.53' });
  });
});
