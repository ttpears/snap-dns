// backend/src/services/__tests__/dnsService.txt.test.ts
// End-to-end TXT quoting contract: AXFR values arrive unquoted, and the nsupdate
// command file quotes them exactly once.
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

const AXFR = [
  'example.com.\t300\tIN\tSOA\tns1.example.com. admin.example.com. 2021 3600 600 86400 300',
  'example.com.\t300\tIN\tTXT\t"v=spf1 include:_spf.example.com  ~all"',
  '_dmarc.example.com.\t300\tIN\tTXT\t"v=DMARC1; p=reject"',
  'split.example.com.\t300\tIN\tTXT\t"part-one" "part-two"',
].join('\n') + '\n';

function mockDigThenNsupdate() {
  // promisify(execFile) calls execFile(cmd, args, cb) or (cmd, args, opts, cb);
  // the callback is always the last argument.
  mockedExecFile.mockImplementation((cmd: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
    if (cmd === 'dig') cb(null, { stdout: AXFR, stderr: '' });
    else cb(null, { stdout: '', stderr: '' }); // nsupdate
  });
}

beforeEach(() => {
  mockedExecFile.mockReset();
  mockedWriteFile.mockClear();
});

describe('TXT read path (AXFR)', () => {
  it('returns unquoted logical values, preserving internal whitespace', async () => {
    mockDigThenNsupdate();
    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    const txt = records.filter(r => r.type === 'TXT');

    expect(txt.find(r => r.name === 'example.com')?.value).toBe(
      'v=spf1 include:_spf.example.com  ~all' // two spaces preserved, no quotes
    );
    expect(txt.find(r => r.name === '_dmarc.example.com')?.value).toBe('v=DMARC1; p=reject');
    // Multi-string TXT concatenates to the logical value (RFC 1035 §3.3.14).
    expect(txt.find(r => r.name === 'split.example.com')?.value).toBe('part-onepart-two');
  });
});

describe('TXT write path (nsupdate file)', () => {
  const updateFileContent = (): string => {
    const call = mockedWriteFile.mock.calls.find(
      ([p]) => typeof p === 'string' && p.includes('update-')
    );
    return call ? (call[1] as string) : '';
  };

  it('quotes a single-string TXT value exactly once', async () => {
    mockDigThenNsupdate();
    const record: DNSRecord = { name: 'www.example.com', type: 'TXT', value: 'v=spf1 -all', ttl: 300, class: 'IN' };
    await dnsService.addRecord('example.com', record, keyConfig);

    const content = updateFileContent();
    expect(content).toContain('update add www.example.com 300 IN TXT "v=spf1 -all"');
    expect(content).not.toContain('\\"'); // no double-quoting / escaped quotes
  });

  it('escapes embedded quotes/backslashes once and quotes each chunk of an array', async () => {
    mockDigThenNsupdate();
    const record: DNSRecord = {
      name: 'raw.example.com', type: 'TXT', value: ['has "q"', 'back\\slash'], ttl: 300, class: 'IN',
    };
    await dnsService.addRecord('example.com', record, keyConfig);

    expect(updateFileContent()).toContain('TXT "has \\"q\\"" "back\\\\slash"');
  });
});
