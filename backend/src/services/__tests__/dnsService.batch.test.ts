// backend/src/services/__tests__/dnsService.batch.test.ts
// Atomic batch apply: all of a zone's changes go into one nsupdate transaction.
import { execFile } from 'child_process';
import { writeFile } from 'fs/promises';
import { dnsService, BatchChange } from '../dnsService';
import { ZoneConfig, DNSRecord } from '../../types/dns';

jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined),
}));

const mockedExecFile = execFile as unknown as jest.Mock;
const mockedWriteFile = writeFile as unknown as jest.Mock;

const keyConfig: ZoneConfig = {
  server: 'ns1.example.com',
  keyName: 'update-key',
  keyValue: 'dGVzdHNlY3JldA==',
  algorithm: 'hmac-sha256',
  id: 'key_1',
};

beforeEach(() => {
  mockedExecFile.mockReset();
  mockedWriteFile.mockClear();
  mockedExecFile.mockImplementation((_cmd: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
    cb(null, { stdout: '', stderr: '' });
  });
});

const batchFileContent = (): string => {
  const call = mockedWriteFile.mock.calls.find(([p]) => typeof p === 'string' && p.includes('batch-'));
  return call ? (call[1] as string) : '';
};

const rec = (over: Partial<DNSRecord>): DNSRecord =>
  ({ name: 'x.example.com', type: 'A', value: '1.2.3.4', ttl: 300, class: 'IN', ...over });

describe('applyBatch', () => {
  it('emits add/delete/update in one transaction with a single send', async () => {
    const changes: BatchChange[] = [
      { op: 'add', record: rec({ name: 'a.example.com', value: '1.1.1.1' }) },
      { op: 'delete', record: rec({ name: 'b.example.com', value: '2.2.2.2' }) },
      { op: 'update', oldRecord: rec({ name: 'c.example.com', value: '3.3.3.3' }), newRecord: rec({ name: 'c.example.com', value: '4.4.4.4' }) },
    ];
    await dnsService.applyBatch('example.com', changes, keyConfig);

    const c = batchFileContent();
    expect(c).toContain('update add a.example.com 300 IN A 1.1.1.1');
    expect(c).toContain('update delete b.example.com A 2.2.2.2');
    expect(c).toContain('prereq yxrrset c.example.com A 3.3.3.3');
    expect(c).toContain('update delete c.example.com A 3.3.3.3');
    expect(c).toContain('update add c.example.com 300 IN A 4.4.4.4');
    // one server/zone header and exactly one send → atomic
    expect(c.match(/^send$/gm)?.length).toBe(1);
    expect(c.startsWith('server ns1.example.com\nzone example.com\n')).toBe(true);
    // one nsupdate invocation, no dig
    const cmds = mockedExecFile.mock.calls.map(x => x[0]);
    expect(cmds).toEqual(['nsupdate']);
  });

  it('writes generic presentation-format types (TLSA/DS) verbatim', async () => {
    const changes: BatchChange[] = [
      { op: 'add', record: rec({ name: '_443._tcp.example.com', type: 'TLSA', value: '3 0 1 ABCDEF0123456789' }) },
      { op: 'add', record: rec({ name: 'example.com', type: 'DS', value: '12345 8 2 49FD46E6' }) },
    ];
    await dnsService.applyBatch('example.com', changes, keyConfig);
    const c = batchFileContent();
    expect(c).toContain('update add _443._tcp.example.com 300 IN TLSA 3 0 1 ABCDEF0123456789');
    expect(c).toContain('update add example.com 300 IN DS 12345 8 2 49FD46E6');
  });

  it('quotes TXT values in a batched update', async () => {
    const changes: BatchChange[] = [
      { op: 'update', oldRecord: rec({ name: 't.example.com', type: 'TXT', value: 'v=spf1 -all' }), newRecord: rec({ name: 't.example.com', type: 'TXT', value: 'v=spf1 ~all' }) },
    ];
    await dnsService.applyBatch('example.com', changes, keyConfig);
    const c = batchFileContent();
    expect(c).toContain('prereq yxrrset t.example.com TXT "v=spf1 -all"');
    expect(c).toContain('update add t.example.com 300 IN TXT "v=spf1 ~all"');
  });

  it('rejects the whole batch if any record carries an injection payload (before running)', async () => {
    const changes: BatchChange[] = [
      { op: 'add', record: rec({ name: 'ok.example.com' }) },
      { op: 'add', record: rec({ name: 'evil\nupdate delete victim.example.com' }) },
    ];
    await expect(dnsService.applyBatch('example.com', changes, keyConfig)).rejects.toThrow(/Invalid record name/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('rejects an empty batch', async () => {
    await expect(dnsService.applyBatch('example.com', [], keyConfig)).rejects.toThrow(/no changes/i);
  });

  it('refuses to delete an SOA record in a batch (never runs anything)', async () => {
    const changes: BatchChange[] = [
      { op: 'delete', record: rec({ name: 'example.com', type: 'SOA', value: 'ns admin 1 2 3 4 5' }) },
    ];
    await expect(dnsService.applyBatch('example.com', changes, keyConfig)).rejects.toThrow(/SOA records cannot be deleted/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('propagates an nsupdate failure so nothing is reported as applied', async () => {
    mockedExecFile.mockImplementation((_cmd: string, ...rest: unknown[]) => {
      const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
      cb(new Error('update failed: REFUSED'), { stdout: '', stderr: 'update failed: REFUSED' });
    });
    const changes: BatchChange[] = [{ op: 'add', record: rec({ name: 'a.example.com' }) }];
    await expect(dnsService.applyBatch('example.com', changes, keyConfig)).rejects.toThrow(/Failed to apply changes/);
  });
});

describe('deleteRecord SOA guard (single-record path)', () => {
  it('refuses to delete an SOA record', async () => {
    const soa = rec({ name: 'example.com', type: 'SOA', value: 'ns admin 1 2 3 4 5' });
    await expect(dnsService.deleteRecord('example.com', soa, keyConfig)).rejects.toThrow(/SOA records cannot be deleted/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });
});
