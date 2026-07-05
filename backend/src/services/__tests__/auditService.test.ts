// backend/src/services/__tests__/auditService.test.ts
// Unit tests for the audit service: verifies the DNS-operation payload shape
// (name/type/valueLength, with value redacted) and the newly added event types.
import { auditService, AuditEventType, AuditEntry } from '../auditService';

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
});
