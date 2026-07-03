// backend/src/services/__tests__/dnsService.update.test.ts
// RFC 2136 update semantics: updates carry a prerequisite and format rdata
// identically to add/delete; adds no longer run a pre-check AXFR.
import { execFile } from 'child_process';
import { writeFile } from 'fs/promises';
import { dnsService } from '../dnsService';
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

const updateFileContent = (): string => {
  const call = mockedWriteFile.mock.calls.find(
    ([p]) => typeof p === 'string' && p.includes('update-')
  );
  return call ? (call[1] as string) : '';
};

describe('updateRecord', () => {
  it('emits prereq yxrrset + delete + add in one transaction', async () => {
    const oldR: DNSRecord = { name: 'www.example.com', type: 'A', value: '1.2.3.4', ttl: 300, class: 'IN' };
    const newR: DNSRecord = { name: 'www.example.com', type: 'A', value: '5.6.7.8', ttl: 300, class: 'IN' };
    await dnsService.updateRecord('example.com', oldR, newR, keyConfig);

    const content = updateFileContent();
    expect(content).toContain('prereq yxrrset www.example.com A 1.2.3.4');
    expect(content).toContain('update delete www.example.com A 1.2.3.4');
    expect(content).toContain('update add www.example.com 300 IN A 5.6.7.8');
    // exactly one send → atomic
    expect(content.match(/^send$/gm)?.length).toBe(1);
  });

  it('quotes TXT values in the update (prereq, delete and add)', async () => {
    const oldR: DNSRecord = { name: 't.example.com', type: 'TXT', value: 'v=spf1 -all', ttl: 300, class: 'IN' };
    const newR: DNSRecord = { name: 't.example.com', type: 'TXT', value: 'v=spf1 ~all', ttl: 300, class: 'IN' };
    await dnsService.updateRecord('example.com', oldR, newR, keyConfig);

    const content = updateFileContent();
    expect(content).toContain('prereq yxrrset t.example.com TXT "v=spf1 -all"');
    expect(content).toContain('update delete t.example.com TXT "v=spf1 -all"');
    expect(content).toContain('update add t.example.com 300 IN TXT "v=spf1 ~all"');
  });
});

describe('addRecord', () => {
  it('does not run a pre-check AXFR (no dig), only nsupdate', async () => {
    const record: DNSRecord = { name: 'new.example.com', type: 'A', value: '1.2.3.4', ttl: 300, class: 'IN' };
    await dnsService.addRecord('example.com', record, keyConfig);

    const commands = mockedExecFile.mock.calls.map(c => c[0]);
    expect(commands).toContain('nsupdate');
    expect(commands).not.toContain('dig');
  });
});
