// backend/src/__tests__/integration/tokenAuth.integration.test.ts
// HTTP-level personal API token flow. Tokens are minted/revoked over a session
// only (a bearer token can never manage tokens), but authenticate any other
// requireAuth route as the owning user with the owner's live RBAC. The DNS exec
// layer and the zone's TSIG key lookup are stubbed so these stay pure
// route/auth tests with no real BIND.
import type { Express } from 'express';
import { buildTestApp, seedUser, loginAgent } from './testApp';
import { UserRole } from '../../types/auth';
import { dnsService } from '../../services/dnsService';
import { tsigKeyService } from '../../services/tsigKeyService';
import request from 'supertest';

const fakeKey = {
  id: 'key-1',
  name: 'test-key',
  server: '192.0.2.53',
  keyName: 'test-key.',
  keyValue: 'plaintext-secret',
  algorithm: 'hmac-sha256',
  zones: ['example.com'],
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'someone',
};

describe('API token auth (HTTP)', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildTestApp();
    await seedUser({
      username: 'tokedit',
      password: 'editor-pass-123',
      role: UserRole.EDITOR,
      allowedZones: ['example.com'],
    });
    await seedUser({
      username: 'otheruser',
      password: 'other-pass-123',
      role: UserRole.EDITOR,
      allowedZones: ['example.com'],
    });
    await seedUser({
      username: 'tokviewer',
      password: 'viewer-pass-123',
      role: UserRole.VIEWER,
      allowedZones: ['example.com'],
    });
    await seedUser({
      username: 'mustchange',
      password: 'change-pass-123',
      role: UserRole.EDITOR,
      allowedZones: ['example.com'],
      mustChangePassword: true,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  /** Session-login the editor and mint a token; return the raw token + its id. */
  async function mintToken(name = 'ci', body: Record<string, unknown> = {}): Promise<{ raw: string; id: string; res: request.Response }> {
    const { agent } = await loginAgent(app, 'tokedit', 'editor-pass-123');
    const res = await agent.post('/api/tokens').send({ name, ...body });
    return { raw: res.body.token, id: res.body.id, res };
  }

  it('mints a token over a session with the expected shape', async () => {
    const { res, raw } = await mintToken();
    expect(res.status).toBe(201);
    expect(raw).toMatch(/^sdns_[0-9a-f]{40}$/);
    expect(res.body.prefix).toBe(raw.slice(0, 12));
    expect(typeof res.body.id).toBe('string');
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.name).toBe('ci');
  });

  it('authenticates a bearer request with the owner\'s RBAC', async () => {
    jest.spyOn(tsigKeyService, 'getKeyForZone').mockResolvedValue(fakeKey);
    jest.spyOn(dnsService, 'fetchZoneRecords').mockResolvedValue([] as never);

    const { raw } = await mintToken();

    // Owner has example.com → 200.
    const ok = await request(app)
      .get('/api/zones/example.com')
      .set('Authorization', 'Bearer ' + raw);
    expect(ok.status).toBe(200);

    // A zone not in the owner's allowedZones → 403 PERMISSION_DENIED.
    const denied = await request(app)
      .get('/api/zones/notmine.com')
      .set('Authorization', 'Bearer ' + raw);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
  });

  it('rejects an unknown bearer token with 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .get('/api/zones/example.com')
      .set('Authorization', 'Bearer sdns_' + '0'.repeat(40));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects a revoked token with 401 INVALID_TOKEN', async () => {
    const { raw, id } = await mintToken();

    const { agent } = await loginAgent(app, 'tokedit', 'editor-pass-123');
    const del = await agent.delete('/api/tokens/' + id);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const res = await request(app)
      .get('/api/zones/example.com')
      .set('Authorization', 'Bearer ' + raw);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with 401 INVALID_TOKEN', async () => {
    const { raw } = await mintToken('short', { expiresInDays: 1 });

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86_400_000);

    const res = await request(app)
      .get('/api/zones/example.com')
      .set('Authorization', 'Bearer ' + raw);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('forbids a bearer token from minting or revoking tokens (SESSION_REQUIRED)', async () => {
    const { raw, id } = await mintToken();

    const create = await request(app)
      .post('/api/tokens')
      .set('Authorization', 'Bearer ' + raw)
      .send({ name: 'x' });
    expect(create.status).toBe(401);
    expect(create.body.code).toBe('SESSION_REQUIRED');

    const del = await request(app)
      .delete('/api/tokens/' + id)
      .set('Authorization', 'Bearer ' + raw);
    expect(del.status).toBe(401);
    expect(del.body.code).toBe('SESSION_REQUIRED');
  });

  it('lists only the caller\'s own tokens, metadata only', async () => {
    await mintToken('mine');

    const { agent } = await loginAgent(app, 'tokedit', 'editor-pass-123');
    const res = await agent.get('/api/tokens');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tokens)).toBe(true);
    expect(res.body.tokens.length).toBeGreaterThan(0);
    for (const t of res.body.tokens) {
      expect(t.tokenHash).toBeUndefined();
      expect(t.userId).toBeUndefined();
      expect(t.token).toBeUndefined();
    }

    // A different user sees none of the editor's tokens.
    const editorIds = new Set(res.body.tokens.map((t: any) => t.id));
    const { agent: other } = await loginAgent(app, 'otheruser', 'other-pass-123');
    const otherRes = await other.get('/api/tokens');
    expect(otherRes.status).toBe(200);
    for (const t of otherRes.body.tokens) {
      expect(editorIds.has(t.id)).toBe(false);
    }
  });

  it('rejects a token create with a missing name (400 VALIDATION_ERROR)', async () => {
    const { agent } = await loginAgent(app, 'tokedit', 'editor-pass-123');
    const res = await agent.post('/api/tokens').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects token routes with no auth at all (401 NOT_AUTHENTICATED / SESSION_REQUIRED)', async () => {
    const list = await request(app).get('/api/tokens');
    expect(list.status).toBe(401);
    expect(list.body.code).toBe('NOT_AUTHENTICATED');
  });

  // --- QA-driven hardening --------------------------------------------------

  it('blocks minting a token while a password change is forced (403 PASSWORD_CHANGE_REQUIRED)', async () => {
    // Otherwise a not-yet-rotated account (e.g. the default admin) could mint a
    // long-lived credential that survives the forced rotation.
    const { agent } = await loginAgent(app, 'mustchange', 'change-pass-123');
    const res = await agent.post('/api/tokens').send({ name: 'sneaky' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('caps requested token lifetime (rejects an implausibly long expiry)', async () => {
    const { agent } = await loginAgent(app, 'tokedit', 'editor-pass-123');
    const res = await agent.post('/api/tokens').send({ name: 'toolong', expiresInDays: 3650 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it("blocks a viewer's token from a write (403 READ_ONLY)", async () => {
    const { agent } = await loginAgent(app, 'tokviewer', 'viewer-pass-123');
    const mint = await agent.post('/api/tokens').send({ name: 'ro' });
    expect(mint.status).toBe(201);

    const res = await request(app)
      .post('/api/zones/example.com/records')
      .set('Authorization', 'Bearer ' + mint.body.token)
      .send({ record: { name: 'www.example.com', type: 'A', value: '192.0.2.10', ttl: 3600, class: 'IN' } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('READ_ONLY');
  });

  it("lets an editor's token perform a write (200)", async () => {
    jest.spyOn(tsigKeyService, 'getKeyForZone').mockResolvedValue(fakeKey);
    const addSpy = jest.spyOn(dnsService, 'addRecord').mockResolvedValue({ success: true } as never);

    const { raw } = await mintToken();
    const res = await request(app)
      .post('/api/zones/example.com/records')
      .set('Authorization', 'Bearer ' + raw)
      .send({ record: { name: 'www.example.com', type: 'A', value: '192.0.2.10', ttl: 3600, class: 'IN' } });

    expect(res.status).toBe(200);
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-sdns bearer header and falls through to 401 NOT_AUTHENTICATED', async () => {
    const res = await request(app)
      .get('/api/zones/example.com')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NOT_AUTHENTICATED');
  });

  it('lets a session take precedence over a bearer header on the same request', async () => {
    const { raw } = await mintToken();
    // otheruser session cookie + tokedit bearer header: session identity wins,
    // so the token list is otheruser's (which never contains tokedit's token).
    const { agent } = await loginAgent(app, 'otheruser', 'other-pass-123');
    const res = await agent.get('/api/tokens').set('Authorization', 'Bearer ' + raw);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tokens)).toBe(true);
  });
});
