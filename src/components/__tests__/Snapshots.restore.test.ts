// src/components/__tests__/Snapshots.restore.test.ts
import { computeRestoreChanges, isRecordEqual, RestoreChange } from '../Snapshots';
import { DNSRecord } from '../../types/dns';

const rec = (name: string, type: string, value: string | object, ttl = 3600): DNSRecord => ({
  name,
  type,
  value,
  ttl,
  class: 'IN'
});

const ctx = {
  zone: 'example.com',
  keyId: 'key-1',
  source: { type: 'backup' as const, id: 'backup-1', timestamp: 1000 }
};

const byType = (changes: RestoreChange[], type: RestoreChange['type']) =>
  changes.filter(c => c.type === type);

describe('computeRestoreChanges', () => {
  describe('partial restore (isFullRestore = false)', () => {
    it('only adds/modifies the selected records and never deletes', () => {
      const current = [rec('a', 'A', '1.1.1.1'), rec('b', 'A', '2.2.2.2'), rec('c', 'A', '3.3.3.3')];
      const snapshot = [
        rec('a', 'A', '1.1.1.1'),
        rec('b', 'A', '2.2.2.2'),
        rec('c', 'A', '3.3.3.3'),
        rec('qa-test', 'A', '9.9.9.9')
      ];
      const selected = [rec('qa-test', 'A', '9.9.9.9')];

      const changes = computeRestoreChanges(current, snapshot, selected, false, ctx);

      expect(byType(changes, 'ADD')).toHaveLength(1);
      expect(byType(changes, 'ADD')[0].record?.name).toBe('qa-test');
      expect(byType(changes, 'DELETE')).toHaveLength(0);
      expect(byType(changes, 'MODIFY')).toHaveLength(0);
    });

    it('regression: selecting one record from a large snapshot does not wipe the zone', () => {
      // Reproduces the live-QA report: 34 current records all present in the
      // snapshot, plus one record (qa-test) to bring back. A partial restore
      // must queue exactly "1 add, 0 deletions", never 34 deletions.
      const current = Array.from({ length: 34 }, (_, i) => rec(`host${i}`, 'A', `10.0.0.${i}`));
      const snapshot = [...current, rec('qa-test', 'A', '9.9.9.9')];
      const selected = [rec('qa-test', 'A', '9.9.9.9')];

      const changes = computeRestoreChanges(current, snapshot, selected, false, ctx);

      expect(byType(changes, 'ADD')).toHaveLength(1);
      expect(byType(changes, 'DELETE')).toHaveLength(0);
      expect(changes).toHaveLength(1);
    });

    it('modifies a selected record whose value drifted, without deleting others', () => {
      const current = [rec('a', 'A', '1.1.1.1'), rec('b', 'A', '2.2.2.2')];
      const snapshot = [rec('a', 'A', '9.9.9.9'), rec('b', 'A', '2.2.2.2')];
      const selected = [rec('a', 'A', '9.9.9.9')];

      const changes = computeRestoreChanges(current, snapshot, selected, false, ctx);

      expect(byType(changes, 'MODIFY')).toHaveLength(1);
      expect(byType(changes, 'MODIFY')[0].newRecord?.value).toBe('9.9.9.9');
      expect(byType(changes, 'DELETE')).toHaveLength(0);
    });

    it('queues no changes when the selected record already matches', () => {
      const current = [rec('a', 'A', '1.1.1.1'), rec('b', 'A', '2.2.2.2')];
      const snapshot = [rec('a', 'A', '1.1.1.1'), rec('b', 'A', '2.2.2.2')];
      const selected = [rec('a', 'A', '1.1.1.1')];

      const changes = computeRestoreChanges(current, snapshot, selected, false, ctx);

      expect(changes).toHaveLength(0);
    });
  });

  describe('full restore (isFullRestore = true)', () => {
    it('adds missing, modifies drifted, and deletes records absent from the snapshot', () => {
      const current = [
        rec('a', 'A', '1.1.1.1'),
        rec('b', 'A', '2.2.2.2'), // drifted from snapshot
        rec('x', 'A', '8.8.8.8')  // drift: not in snapshot
      ];
      const snapshot = [
        rec('a', 'A', '1.1.1.1'),
        rec('b', 'A', '5.5.5.5'), // original value
        rec('c', 'A', '3.3.3.3')  // missing from current
      ];

      const changes = computeRestoreChanges(current, snapshot, snapshot, true, ctx);

      expect(byType(changes, 'ADD').map(c => c.record?.name)).toEqual(['c']);
      expect(byType(changes, 'MODIFY').map(c => c.newRecord?.name)).toEqual(['b']);
      expect(byType(changes, 'DELETE').map(c => c.record?.name)).toContain('x');
      // 'a' is unchanged and present in the snapshot: never deleted.
      expect(byType(changes, 'DELETE').map(c => c.record?.name)).not.toContain('a');
    });

    it('deletion baseline is the full snapshot, not the selected subset', () => {
      // Even if a caller passes a subset as `selectedRecords`, deletions must be
      // computed against the full snapshot so present records survive.
      const current = [rec('a', 'A', '1.1.1.1'), rec('b', 'A', '2.2.2.2')];
      const snapshot = [rec('a', 'A', '1.1.1.1'), rec('b', 'A', '2.2.2.2')];
      const selected = [rec('a', 'A', '1.1.1.1')]; // subset

      const changes = computeRestoreChanges(current, snapshot, selected, true, ctx);

      // 'b' is in the full snapshot -> not deleted despite not being selected.
      expect(byType(changes, 'DELETE')).toHaveLength(0);
    });

    it('never deletes the SOA record even when it drifts', () => {
      const soaCurrent = rec('example.com', 'SOA', 'ns1 admin 5 10 20 30 40');
      const soaSnapshot = rec('example.com', 'SOA', 'ns1 admin 1 10 20 30 40');
      const current = [soaCurrent, rec('orphan', 'A', '7.7.7.7')];
      const snapshot = [soaSnapshot];

      const changes = computeRestoreChanges(current, snapshot, snapshot, true, ctx);

      expect(byType(changes, 'DELETE').map(c => c.record?.type)).not.toContain('SOA');
      expect(byType(changes, 'DELETE').map(c => c.record?.name)).toContain('orphan');
    });

    it('ignores TSIG records on both sides', () => {
      const current = [rec('a', 'A', '1.1.1.1'), rec('key', 'TSIG', 'sig')];
      const snapshot = [rec('a', 'A', '1.1.1.1'), rec('key', 'TSIG', 'sig')];

      const changes = computeRestoreChanges(current, snapshot, snapshot, true, ctx);

      expect(changes).toHaveLength(0);
    });
  });
});

describe('isRecordEqual', () => {
  it('treats trailing dots and case as equal for CNAME-like values', () => {
    expect(isRecordEqual(rec('a', 'CNAME', 'Host.Example.com.'), rec('a', 'CNAME', 'host.example.com'))).toBe(true);
  });

  it('returns false when A record values differ', () => {
    expect(isRecordEqual(rec('a', 'A', '1.1.1.1'), rec('a', 'A', '2.2.2.2'))).toBe(false);
  });

  it('compares MX priority and exchange regardless of case/dot', () => {
    expect(isRecordEqual(rec('a', 'MX', '10 Mail.Example.com.'), rec('a', 'MX', '10 mail.example.com'))).toBe(true);
    expect(isRecordEqual(rec('a', 'MX', '10 mail.example.com'), rec('a', 'MX', '20 mail.example.com'))).toBe(false);
  });
});
