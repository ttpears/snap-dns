// backend/src/services/__tests__/dnsService.axfr.test.ts
// AXFR ingestion: case-sensitive rdata must survive normalization, and a failed
// transfer must not be reported as an empty zone.
import { execFile } from 'child_process';
import { dnsService } from '../dnsService';
import { ZoneConfig } from '../../types/dns';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

const mockedExecFile = execFile as unknown as jest.Mock;

const keyConfig: ZoneConfig = {
  server: 'ns1.example.com',
  keyName: 'update-key',
  keyValue: 'dGVzdHNlY3JldA==',
  algorithm: 'hmac-sha256',
  id: 'key_1',
};

const SOA_LINE = 'example.com.\t300\tIN\tSOA\tns1.example.com. admin.example.com. 2021 3600 600 86400 300';

function mockDig(stdout: string) {
  mockedExecFile.mockImplementation((_cmd: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
    cb(null, { stdout, stderr: '' });
  });
}

beforeEach(() => mockedExecFile.mockReset());

describe('AXFR rdata normalization', () => {
  it('preserves case-sensitive DNSSEC rdata verbatim (no lowercasing)', async () => {
    const b64 = 'AwEAAcMixedCaseKeyDataXYZabc0123+/==';
    mockDig([SOA_LINE, `example.com.\t300\tIN\tDNSKEY\t256 3 8 ${b64}`].join('\n') + '\n');

    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    const dnskey = records.find(r => r.type === 'DNSKEY');
    expect(dnskey?.value).toBe(`256 3 8 ${b64}`);
  });

  it('still lowercases and strips the trailing dot on name-valued rdata (CNAME)', async () => {
    mockDig([SOA_LINE, 'WWW.example.com.\t300\tIN\tCNAME\tTarget.EXAMPLE.com.'].join('\n') + '\n');

    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    const cname = records.find(r => r.type === 'CNAME');
    expect(cname?.value).toBe('target.example.com');
  });
});

describe('AXFR failure detection', () => {
  it('throws when dig reports a failed transfer instead of returning an empty zone', async () => {
    mockDig('; Transfer failed.\n');
    await expect(dnsService.fetchZoneRecords('example.com', keyConfig)).rejects.toThrow(/failed/i);
  });

  it('throws when the response contains no SOA (incomplete transfer)', async () => {
    mockDig('www.example.com.\t300\tIN\tA\t1.2.3.4\n');
    await expect(dnsService.fetchZoneRecords('example.com', keyConfig)).rejects.toThrow(/incomplete|SOA/i);
  });

  it('does not treat record data containing "transfer failed" as a failure', async () => {
    mockDig([SOA_LINE, 'x.example.com.\t300\tIN\tTXT\t"transfer failed report"'].join('\n') + '\n');
    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    expect(records.some(r => r.type === 'TXT' && r.value === 'transfer failed report')).toBe(true);
  });

  it('succeeds for a well-formed transfer that begins with an SOA', async () => {
    mockDig([SOA_LINE, 'www.example.com.\t300\tIN\tA\t1.2.3.4'].join('\n') + '\n');
    const records = await dnsService.fetchZoneRecords('example.com', keyConfig);
    expect(records.some(r => r.type === 'SOA')).toBe(true);
    expect(records.some(r => r.type === 'A' && r.value === '1.2.3.4')).toBe(true);
  });
});
