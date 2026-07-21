// backend/src/services/__tests__/apiTokenService.test.ts
// Personal API token lifecycle: only a sha256 hash of the raw token is ever
// persisted (never the raw string), verification is constant-time and reflects
// expiry/revocation, lastUsedAt is touched at most once per minute, and list is
// owner-scoped and metadata-only. Uses a temp file so each test starts clean.
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { ApiTokenService } from '../apiTokenService';

const sha256hex = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');

describe('ApiTokenService', () => {
  let dir: string;
  let filePath: string;
  let svc: ApiTokenService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-tokens-'));
    filePath = path.join(dir, 'api-tokens.json');
    svc = new ApiTokenService({ filePath });
    await svc.initialize();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates a token, hashing it and never persisting the raw value', async () => {
    const { raw, record } = await svc.createToken('u1', 'ci');

    expect(raw).toMatch(/^sdns_[0-9a-f]{40}$/);
    expect(record.tokenHash).toBe(sha256hex(raw));
    expect(record.tokenPrefix).toBe(raw.slice(0, 12));
    expect(record.userId).toBe('u1');
    expect(record.lastUsedAt).toBeNull();
    expect(record.revokedAt).toBeNull();

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).not.toContain(raw);
    expect(content).toContain(record.tokenHash);
  });

  it('verifies a valid token and rejects an unknown one', async () => {
    const { raw, record } = await svc.createToken('u1', 'ci');

    const ok = await svc.verifyToken(raw);
    expect(ok.status).toBe('valid');
    if (ok.status === 'valid') {
      expect(ok.token.id).toBe(record.id);
    }

    const bad = await svc.verifyToken('sdns_' + '0'.repeat(40));
    expect(bad.status).toBe('not_found');
  });

  it('reports an expired token as expired', async () => {
    const { raw } = await svc.createToken('u1', 'ci', 1);

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86_400_000);

    const res = await svc.verifyToken(raw);
    expect(res.status).toBe('expired');
  });

  it('revokes a token (owner-scoped) and reports it revoked', async () => {
    const { raw, record } = await svc.createToken('u1', 'ci');

    // Wrong owner cannot revoke.
    expect(await svc.revokeToken('otherUser', record.id)).toBe(false);
    // Unknown id cannot revoke.
    expect(await svc.revokeToken('u1', 'missing')).toBe(false);

    expect(await svc.revokeToken('u1', record.id)).toBe(true);

    const res = await svc.verifyToken(raw);
    expect(res.status).toBe('revoked');

    // Double-revoke is a no-op false.
    expect(await svc.revokeToken('u1', record.id)).toBe(false);

    const list = await svc.listTokensForUser('u1');
    expect(list.find(t => t.id === record.id)).toBeUndefined();
  });

  it('touches lastUsedAt at most once per minute', async () => {
    // Fake timers so Date.now() and new Date() share one deterministic clock —
    // the service touches lastUsedAt with new Date() but throttles off Date.now().
    const base = 1_700_000_000_000;
    jest.useFakeTimers();
    jest.setSystemTime(base);

    try {
      const { raw } = await svc.createToken('u1', 'ci');

      // First verify stamps lastUsedAt.
      await svc.verifyToken(raw);
      let list = await svc.listTokensForUser('u1');
      const firstUsed = list[0].lastUsedAt;
      expect(firstUsed).not.toBeNull();
      expect(firstUsed?.getTime()).toBe(base);

      // Immediate second verify (within the window) must NOT advance it.
      jest.setSystemTime(base + 30_000);
      await svc.verifyToken(raw);
      list = await svc.listTokensForUser('u1');
      expect(list[0].lastUsedAt?.getTime()).toBe(base);

      // Past the 60s throttle window it advances.
      jest.setSystemTime(base + 61_000);
      await svc.verifyToken(raw);
      list = await svc.listTokensForUser('u1');
      expect(list[0].lastUsedAt?.getTime()).toBe(base + 61_000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists only the caller\'s non-revoked tokens as metadata only', async () => {
    const a = await svc.createToken('u1', 'a');
    await svc.createToken('u2', 'b');

    const list = await svc.listTokensForUser('u1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a.record.id);

    // Metadata only: no secret material, no owner id.
    const item = list[0] as unknown as Record<string, unknown>;
    expect(item.tokenHash).toBeUndefined();
    expect(item.userId).toBeUndefined();
    expect(item.prefix).toBe(a.record.tokenPrefix);
  });
});
