// backend/src/services/__tests__/dnsService.rfc3597.test.ts
// RFC 3597 unknown record types end-to-end through dnsService: AXFR ingestion
// must keep the TYPE#### token and the generic "\# <length> <hex>" RDATA
// verbatim, and the write paths must emit valid RFC 3597 nsupdate syntax.
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

const SOA_LINE = 'example.com.\t300\tIN\tSOA\tns1.example.com. admin.example.com. 2021 3600 600 86400 300';

const rec = (over: Partial<DNSRecord>): DNSRecord =>
  ({ name: 'x.example.com', type: 'TYPE65534', value: '\\# 4 0A000001', ttl: 300, class: 'IN', ...over });

beforeEach(() => {
  mockedExecFile.mockReset();
  mockedWriteFile.mockClear();
  mockedExecFile.mockImplementation((_cmd: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
    cb(null, { stdout: '', stderr: '' });
  });
});

const fileContent = (prefix: string): string => {
  const call = mockedWriteFile.mock.calls.find(([p]) => typeof p === 'string' && p.includes(prefix));
  return call ? (call[1] as string) : '';
};

function mockDig(stdout: string) {
  mockedExecFile.mockImplementation((cmd: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
    cb(null, { stdout: cmd === 'dig' ? stdout : '', stderr: '' });
  });
}

describe('AXFR ingestion of RFC 3597 unknown types', () => {
  it('keeps the TYPE#### token and the \\# rdata verbatim', async () => {
    mockDig([SOA_LINE, 'Host.example.com.\t300\tIN\tTYPE65534\t\\# 4 0A000001'].join('\n') + '\n');

    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    const unknown = records.find(r => r.type === 'TYPE65534');
    expect(unknown).toBeDefined();
    // Owner name is canonicalised (lowercase, no trailing dot) but the RDATA —
    // including hex case — must survive byte-for-byte.
    expect(unknown?.name).toBe('host.example.com');
    expect(unknown?.value).toBe('\\# 4 0A000001');
    expect(unknown?.ttl).toBe(300);
    expect(unknown?.class).toBe('IN');
  });

  it('keeps grouped hex rdata verbatim (RFC 3597 allows whitespace-split groups)', async () => {
    mockDig([SOA_LINE, 'x.example.com.\t300\tIN\tTYPE64000\t\\# 6 0A00 0001 FFFE'].join('\n') + '\n');

    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    expect(records.find(r => r.type === 'TYPE64000')?.value).toBe('\\# 6 0A00 0001 FFFE');
  });

  it('parses empty generic rdata (\\# 0)', async () => {
    mockDig([SOA_LINE, 'x.example.com.\t300\tIN\tTYPE65280\t\\# 0'].join('\n') + '\n');

    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    expect(records.find(r => r.type === 'TYPE65280')?.value).toBe('\\# 0');
  });
});

describe('nsupdate file generation for unknown types', () => {
  it('addRecord emits RFC 3597 update-add syntax verbatim', async () => {
    await dnsService.addRecord('example.com', rec({}), keyConfig);
    const c = fileContent('update-');
    expect(c).toContain('update add x.example.com 300 IN TYPE65534 \\# 4 0A000001');
    expect(c.match(/^send$/m)).toBeTruthy();
  });

  it('deleteRecord emits the specific RR with its \\# rdata', async () => {
    await dnsService.deleteRecord('example.com', rec({}), keyConfig);
    const c = fileContent('update-');
    expect(c).toContain('update delete x.example.com TYPE65534 \\# 4 0A000001');
  });

  it('updateRecord builds an atomic prereq/delete/add transaction', async () => {
    await dnsService.updateRecord(
      'example.com',
      rec({}),
      rec({ value: '\\# 4 0A000002' }),
      keyConfig
    );
    const c = fileContent('update-');
    expect(c).toContain('prereq yxrrset x.example.com TYPE65534 \\# 4 0A000001');
    expect(c).toContain('update delete x.example.com TYPE65534 \\# 4 0A000001');
    expect(c).toContain('update add x.example.com 300 IN TYPE65534 \\# 4 0A000002');
  });

  it('applyBatch round-trips add/delete/update of unknown types in one send', async () => {
    const changes: BatchChange[] = [
      { op: 'add', record: rec({ name: 'a.example.com' }) },
      { op: 'delete', record: rec({ name: 'b.example.com', type: 'TYPE65280', value: '\\# 0' }) },
      {
        op: 'update',
        oldRecord: rec({ name: 'c.example.com' }),
        newRecord: rec({ name: 'c.example.com', value: '\\# 2 FFFE' }),
      },
    ];
    await dnsService.applyBatch('example.com', changes, keyConfig);

    const c = fileContent('batch-');
    expect(c).toContain('update add a.example.com 300 IN TYPE65534 \\# 4 0A000001');
    expect(c).toContain('update delete b.example.com TYPE65280 \\# 0');
    expect(c).toContain('prereq yxrrset c.example.com TYPE65534 \\# 4 0A000001');
    expect(c).toContain('update delete c.example.com TYPE65534 \\# 4 0A000001');
    expect(c).toContain('update add c.example.com 300 IN TYPE65534 \\# 2 FFFE');
    expect(c.match(/^send$/gm)?.length).toBe(1);
  });

  it('rejects an unknown-type record whose value smuggles a control character', async () => {
    const evil = rec({ value: '\\# 4 0A000001\nupdate delete victim.example.com A' });
    await expect(dnsService.addRecord('example.com', evil, keyConfig)).rejects.toThrow(/control character/i);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('rejects a type token that is not a single alphanumeric token', async () => {
    const evil = rec({ type: 'TYPE65534 extra' });
    await expect(dnsService.addRecord('example.com', evil, keyConfig)).rejects.toThrow(/Invalid record type/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });
});
