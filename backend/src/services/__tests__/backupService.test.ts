// backend/src/services/__tests__/backupService.test.ts
// The snapshot store must never grow past its total size budget: once creating a
// snapshot would exceed the budget, the oldest snapshots (globally, across all
// zones) are evicted first. A single snapshot larger than the whole budget is
// rejected outright. Together these bound on-disk usage regardless of how many
// zones or snapshots are created.
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { BackupService, DNSRecord } from '../backupService';

// Records sized to a predictable byte count so budgets are easy to reason about.
const recordsOfSize = (bytes: number): DNSRecord[] => [
  { name: 'big.example.com', type: 'TXT', value: 'x'.repeat(bytes), ttl: 300, class: 'IN' },
];

async function dirTotalBytes(dir: string): Promise<number> {
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  let total = 0;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    total += (await fs.stat(path.join(dir, f))).size;
  }
  return total;
}

describe('BackupService total-size budget', () => {
  let dir: string;
  let nowValue: number;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-backups-'));
    // Monotonic clock so each snapshot gets a strictly newer timestamp/id, making
    // "oldest evicted first" deterministic.
    nowValue = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => (nowValue += 1000));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const opts = { server: '192.0.2.53', type: 'manual' as const };

  it('keeps total on-disk size within the budget by evicting oldest first', async () => {
    const svc = new BackupService({ dir, maxTotalBytes: 20 * 1024 });

    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const b = await svc.createBackup('example.com', recordsOfSize(4 * 1024), 'u1', opts);
      ids.push(b.id);
    }

    // Budget is respected...
    expect(await dirTotalBytes(dir)).toBeLessThanOrEqual(20 * 1024);

    // ...eviction actually happened (not all 10 survived)...
    const remaining = await svc.getBackupsForZone('example.com', 'u1', 'admin');
    expect(remaining.length).toBeLessThan(10);

    // ...the newest snapshot survives and the oldest is gone.
    const remainingIds = remaining.map(b => b.id);
    expect(remainingIds).toContain(ids[ids.length - 1]);
    expect(remainingIds).not.toContain(ids[0]);
  });

  it('evicts the globally-oldest snapshot even when it lives in another zone', async () => {
    const svc = new BackupService({ dir, maxTotalBytes: 20 * 1024 });

    // Oldest snapshot is in zone A; newer ones pile into zone B until the budget
    // forces an eviction.
    const oldest = await svc.createBackup('a.example.com', recordsOfSize(4 * 1024), 'u1', opts);
    const newer: string[] = [];
    for (let i = 0; i < 8; i++) {
      const b = await svc.createBackup('b.example.com', recordsOfSize(4 * 1024), 'u1', opts);
      newer.push(b.id);
    }

    expect(await dirTotalBytes(dir)).toBeLessThanOrEqual(20 * 1024);

    const zoneA = await svc.getBackupsForZone('a.example.com', 'u1', 'admin');
    expect(zoneA.map(b => b.id)).not.toContain(oldest.id);
    // The newest zone-B snapshot must still be there.
    const zoneB = await svc.getBackupsForZone('b.example.com', 'u1', 'admin');
    expect(zoneB.map(b => b.id)).toContain(newer[newer.length - 1]);
  });

  it('rejects a single snapshot larger than the entire budget and writes nothing', async () => {
    const svc = new BackupService({ dir, maxTotalBytes: 2 * 1024 });

    await expect(
      svc.createBackup('example.com', recordsOfSize(8 * 1024), 'u1', opts)
    ).rejects.toThrow(/budget/i);

    expect(await dirTotalBytes(dir)).toBeLessThanOrEqual(2 * 1024);
    const remaining = await svc.getBackupsForZone('example.com', 'u1', 'admin');
    expect(remaining).toHaveLength(0);
  });

  it('retains all snapshots when comfortably under budget (newest first)', async () => {
    const svc = new BackupService({ dir, maxTotalBytes: 10 * 1024 * 1024 });

    const first = await svc.createBackup('example.com', recordsOfSize(100), 'u1', opts);
    const second = await svc.createBackup('example.com', recordsOfSize(100), 'u1', opts);

    const remaining = await svc.getBackupsForZone('example.com', 'u1', 'admin');
    expect(remaining.map(b => b.id)).toEqual([second.id, first.id]);
  });
});
