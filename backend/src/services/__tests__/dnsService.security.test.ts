// backend/src/services/__tests__/dnsService.security.test.ts
// Guards against command / nsupdate-file injection. child_process is mocked so a
// leaked payload would surface as an executed command; a rejected payload never
// reaches the mock.
import { execFile } from 'child_process';
import { dnsService } from '../dnsService';
import { ZoneConfig, DNSRecord } from '../../types/dns';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

const mockedExecFile = execFile as unknown as jest.Mock;

const keyConfig: ZoneConfig = {
  server: 'ns1.example.com',
  keyName: 'update-key',
  keyValue: 'dGVzdHNlY3JldA==',
  algorithm: 'hmac-sha256',
  id: 'key_1',
};

const record = (over: Partial<DNSRecord>): DNSRecord => ({
  name: 'www.example.com',
  type: 'A',
  value: '1.2.3.4',
  ttl: 300,
  class: 'IN',
  ...over,
});

beforeEach(() => {
  mockedExecFile.mockReset();
  // promisify(execFile) invokes the callback form: (cmd, args, opts, cb)
  // A minimal well-formed AXFR (starts with the SOA) so fetchZoneRecords treats
  // it as a complete transfer; injection tests reject before dig is ever run.
  mockedExecFile.mockImplementation((_cmd: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: unknown, out: { stdout: string; stderr: string }) => void;
    cb(null, {
      stdout: 'example.com.\t300\tIN\tSOA\tns1.example.com. admin.example.com. 1 3600 600 86400 300\n',
      stderr: '',
    });
  });
});

describe('dnsService injection guards', () => {
  it('rejects a record name carrying an nsupdate directive, before running anything', async () => {
    const evil = record({ name: 'x\nupdate delete victim.example.com\nsend' });
    await expect(dnsService.addRecord('example.com', evil, keyConfig)).rejects.toThrow(/Invalid record name/);
    await expect(dnsService.deleteRecord('example.com', evil, keyConfig)).rejects.toThrow(/Invalid record name/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('rejects a control character embedded in the record value', async () => {
    const evil = record({ type: 'TXT', value: 'good\nupdate delete victim.example.com' });
    await expect(dnsService.addRecord('example.com', evil, keyConfig)).rejects.toThrow(/control character/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('rejects a zone name with shell/nsupdate metacharacters', async () => {
    await expect(dnsService.fetchZoneRecords('example.com; rm -rf /', keyConfig)).rejects.toThrow(/Invalid zone name/);
    await expect(dnsService.fetchZoneRecords('example.com\nsend', keyConfig)).rejects.toThrow(/Invalid zone name/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('rejects a TSIG key name that would break out of the key clause', async () => {
    const badKey: ZoneConfig = { ...keyConfig, keyName: 'k"; }; system("id"); key "x' };
    await expect(dnsService.fetchZoneRecords('example.com', badKey)).rejects.toThrow(/Invalid TSIG key name/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('rejects a non-base64 TSIG secret', async () => {
    const badKey: ZoneConfig = { ...keyConfig, keyValue: 'not a secret"; }' };
    await expect(dnsService.fetchZoneRecords('example.com', badKey)).rejects.toThrow(/Invalid TSIG key secret/);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('invokes dig via argv (no shell string) for a clean transfer', async () => {
    await dnsService.fetchZoneRecords('example.com', keyConfig);
    expect(mockedExecFile).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockedExecFile.mock.calls[0];
    expect(cmd).toBe('dig');
    expect(args).toEqual(expect.arrayContaining(['@ns1.example.com', 'example.com', 'AXFR', '-k']));
    // secret must never appear as a command argument
    expect(JSON.stringify(args)).not.toContain(keyConfig.keyValue);
  });
});
