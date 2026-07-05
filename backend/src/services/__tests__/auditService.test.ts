// backend/src/services/__tests__/auditService.test.ts
// Unit tests for the audit service: verifies the DNS-operation payload shape
// (name/type/valueLength, with value redacted), the newly added event types,
// and size-based log rotation (ring, cross-file reads, format/redaction).
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { auditService, AuditService, AuditEventType, AuditEntry } from '../auditService';
import { resolveAuditLogConfig } from '../../config/auditLog';

describe('auditService', () => {
  // Capture the entries the service would persist without touching the real
  // audit.log file. writeEntry is private, so we spy through an any-cast.
  function captureEntries(): AuditEntry[] {
    const entries: AuditEntry[] = [];
    jest
      .spyOn(auditService as unknown as { writeEntry: (e: AuditEntry) => Promise<void> }, 'writeEntry')
      .mockImplementation(async (entry: AuditEntry) => {
        entries.push(entry);
      });
    return entries;
  }

  async function flush(): Promise<void> {
    // The service serializes writes through an internal queue; awaiting it
    // guarantees the mocked writeEntry has run for all pending log() calls.
    await (auditService as unknown as { writeQueue: Promise<void> }).writeQueue;
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(jest.fn());
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('new event types', () => {
    it('exposes snapshot and config lifecycle event types', () => {
      expect(AuditEventType.SNAPSHOT_CREATED).toBe('snapshot.created');
      expect(AuditEventType.SNAPSHOT_DELETED).toBe('snapshot.deleted');
      expect(AuditEventType.WEBHOOK_CONFIG_UPDATED).toBe('config.webhook.updated');
      expect(AuditEventType.WEBHOOK_CONFIG_DELETED).toBe('config.webhook.deleted');
      expect(AuditEventType.SSO_CONFIG_UPDATED).toBe('config.sso.updated');
    });

    it('persists a snapshot-created entry with zone and snapshot metadata', async () => {
      const entries = captureEntries();

      await auditService.log(AuditEventType.SNAPSHOT_CREATED, {
        userId: 'u1',
        username: 'admin',
        success: true,
        details: { zone: 'test.local', snapshotId: 'snap-1', recordCount: 3 },
      });
      await flush();

      expect(entries).toHaveLength(1);
      expect(entries[0].eventType).toBe(AuditEventType.SNAPSHOT_CREATED);
      expect(entries[0].details).toEqual({
        zone: 'test.local',
        snapshotId: 'snap-1',
        recordCount: 3,
      });
      expect(entries[0].timestamp).toEqual(expect.any(String));
    });
  });

  describe('logDNSOperation payload', () => {
    it('records name/type/valueLength for an update without leaking the value', async () => {
      const entries = captureEntries();
      const newRecord = { name: 'www.test.local', type: 'A', value: '192.0.2.10' };

      await auditService.logDNSOperation('update', 'test.local', newRecord, 'u1', 'admin', true);
      await flush();

      expect(entries).toHaveLength(1);
      const entry = entries[0];
      expect(entry.eventType).toBe(AuditEventType.RECORD_UPDATED);
      expect(entry.details.zone).toBe('test.local');
      expect(entry.details.record).toEqual({
        name: 'www.test.local',
        type: 'A',
        valueLength: '192.0.2.10'.length,
      });
      // Redaction: the raw value must never appear in the persisted entry.
      expect(JSON.stringify(entry)).not.toContain('192.0.2.10');
    });

    it('produces the same payload shape for add, delete, and update', async () => {
      const entries = captureEntries();
      const record = { name: 'mail.test.local', type: 'MX', value: '10 mx.test.local' };

      await auditService.logDNSOperation('add', 'test.local', record, 'u1', 'admin', true);
      await auditService.logDNSOperation('delete', 'test.local', record, 'u1', 'admin', true);
      await auditService.logDNSOperation('update', 'test.local', record, 'u1', 'admin', true);
      await flush();

      const shapes = entries.map((e) => e.details.record);
      for (const shape of shapes) {
        expect(shape).toEqual({
          name: 'mail.test.local',
          type: 'MX',
          valueLength: '10 mx.test.local'.length,
        });
      }
    });

    it('reports valueLength 0 when the record has no string value', async () => {
      const entries = captureEntries();
      const record = { name: 'test.local', type: 'A' };

      await auditService.logDNSOperation('add', 'test.local', record, 'u1', 'admin', true);
      await flush();

      expect(entries[0].details.record.valueLength).toBe(0);
    });
  });

  describe('log rotation', () => {
    let tmpDir: string;
    let logFile: string;

    // Await a fresh service's internal write queue so all queued log() calls
    // (and their rotation + append) have completed before assertions.
    async function flushService(svc: AuditService): Promise<void> {
      await (svc as unknown as { writeQueue: Promise<void> }).writeQueue;
    }

    async function exists(file: string): Promise<boolean> {
      try {
        await fs.access(file);
        return true;
      } catch {
        return false;
      }
    }

    async function readEntries(file: string): Promise<AuditEntry[]> {
      const content = await fs.readFile(file, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as AuditEntry);
    }

    // Log `count` events, each tagged with its index, awaiting the queue so the
    // sequential rotate-then-append runs deterministically per entry.
    async function logSequential(svc: AuditService, count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        await svc.log(AuditEventType.ZONE_QUERIED, {
          userId: 'u1',
          username: 'admin',
          success: true,
          details: { index: i },
        });
      }
      await flushService(svc);
    }

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-rotation-'));
      logFile = path.join(tmpDir, 'audit.log');
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('does not rotate while the active file stays under the size cap', async () => {
      // 10 KB cap easily holds a handful of tiny entries.
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10 * 1024, maxFiles: 5 });
      await logSequential(svc, 5);

      expect(await exists(logFile)).toBe(true);
      expect(await exists(`${logFile}.1`)).toBe(false);
      expect(await readEntries(logFile)).toHaveLength(5);
    });

    it('rotates the active file once the threshold would be exceeded', async () => {
      // Tiny cap: every write after the first rotates the current file to .1.
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      await logSequential(svc, 2);

      expect(await exists(logFile)).toBe(true);
      expect(await exists(`${logFile}.1`)).toBe(true);
      // Active file holds the newest entry; .1 holds the previous one.
      expect((await readEntries(logFile))[0].details.index).toBe(1);
      expect((await readEntries(`${logFile}.1`))[0].details.index).toBe(0);
    });

    it('keeps at most maxFiles rotated files and deletes the oldest', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 2 });
      // Write far more than the ring can hold.
      await logSequential(svc, 6);

      expect(await exists(logFile)).toBe(true); // active
      expect(await exists(`${logFile}.1`)).toBe(true);
      expect(await exists(`${logFile}.2`)).toBe(true);
      // Ring is capped at maxFiles=2 rotated files; no third rotated file.
      expect(await exists(`${logFile}.3`)).toBe(false);

      // Only the newest 3 entries (active + 2 rotated) survive: indices 5,4,3.
      expect((await readEntries(logFile))[0].details.index).toBe(5);
      expect((await readEntries(`${logFile}.1`))[0].details.index).toBe(4);
      expect((await readEntries(`${logFile}.2`))[0].details.index).toBe(3);
    });

    it('returns the last N entries newest-first across a rotation boundary', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      await logSequential(svc, 6); // entries span audit.log + .1..

      const result = await svc.query({ limit: 3 });
      expect(result.map((e) => e.details.index)).toEqual([5, 4, 3]);
    });

    it('reads all rotated files newest-first when no limit is given', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      await logSequential(svc, 6); // exactly fills active + 5 rotated

      const result = await svc.query();
      expect(result.map((e) => e.details.index)).toEqual([5, 4, 3, 2, 1, 0]);
    });

    it('drops entries older than the ring capacity from reads', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      await logSequential(svc, 7); // one more than the ring holds

      const result = await svc.query();
      // Oldest (index 0) has been rotated out of the ring entirely.
      expect(result.map((e) => e.details.index)).toEqual([6, 5, 4, 3, 2, 1]);
    });

    it('applies filters correctly across rotated files', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      await svc.log(AuditEventType.LOGIN_SUCCESS, { userId: 'a', username: 'alice', success: true });
      await svc.log(AuditEventType.LOGIN_FAILURE, { userId: 'b', username: 'bob', success: false });
      await svc.log(AuditEventType.LOGIN_SUCCESS, { userId: 'a', username: 'alice', success: true });
      await flushService(svc);

      const result = await svc.query({ userId: 'a' });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.userId === 'a')).toBe(true);
    });

    it('preserves the one-JSON-object-per-line format and redaction after rotation', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      // A DNS op whose raw value must never be persisted, then more writes to
      // push it into a rotated file.
      await svc.logDNSOperation('add', 'test.local', { name: 'www.test.local', type: 'A', value: '203.0.113.7' }, 'u1', 'admin', true);
      await svc.log(AuditEventType.ZONE_QUERIED, { userId: 'u1', username: 'admin', success: true });
      await svc.log(AuditEventType.ZONE_QUERIED, { userId: 'u1', username: 'admin', success: true });
      await flushService(svc);

      // The DNS op is now in a rotated file; every rotated file is still valid
      // one-object-per-line JSON with the value redacted.
      for (let i = 1; i <= 5; i++) {
        const rotated = `${logFile}.${i}`;
        if (!(await exists(rotated))) {
          continue;
        }
        const raw = await fs.readFile(rotated, 'utf-8');
        for (const line of raw.split('\n').filter((l) => l.trim())) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
        expect(raw).not.toContain('203.0.113.7');
      }

      const found = await svc.query({ eventType: AuditEventType.RECORD_ADDED });
      expect(found).toHaveLength(1);
      expect(found[0].details.record).toEqual({
        name: 'www.test.local',
        type: 'A',
        valueLength: '203.0.113.7'.length,
      });
      expect(JSON.stringify(found[0])).not.toContain('203.0.113.7');
    });

    it('returns [] when no log file exists yet', async () => {
      const svc = new AuditService({ filePath: logFile, maxSizeBytes: 10, maxFiles: 5 });
      expect(await svc.query({ limit: 100 })).toEqual([]);
    });
  });

  describe('resolveAuditLogConfig', () => {
    it('applies sane defaults (10 MB, 5 files, data/audit.log)', () => {
      const cfg = resolveAuditLogConfig({} as NodeJS.ProcessEnv);
      expect(cfg.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(cfg.maxFiles).toBe(5);
      expect(cfg.filePath.endsWith(path.join('data', 'audit.log'))).toBe(true);
    });

    it('honours AUDIT_LOG_MAX_SIZE_MB, AUDIT_LOG_MAX_FILES and AUDIT_LOG_FILE', () => {
      const cfg = resolveAuditLogConfig({
        AUDIT_LOG_MAX_SIZE_MB: '2',
        AUDIT_LOG_MAX_FILES: '3',
        AUDIT_LOG_FILE: '/var/log/snap/audit.log',
      } as unknown as NodeJS.ProcessEnv);
      expect(cfg.maxSizeBytes).toBe(2 * 1024 * 1024);
      expect(cfg.maxFiles).toBe(3);
      expect(cfg.filePath).toBe('/var/log/snap/audit.log');
    });

    it('falls back to defaults for invalid or non-positive values', () => {
      const cfg = resolveAuditLogConfig({
        AUDIT_LOG_MAX_SIZE_MB: 'not-a-number',
        AUDIT_LOG_MAX_FILES: '0',
      } as unknown as NodeJS.ProcessEnv);
      expect(cfg.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(cfg.maxFiles).toBe(5);
    });
  });
});
