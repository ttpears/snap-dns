import { BackupService } from '../backupService';
import type { Config } from '../../config';
import { RecordType } from '../../types/dns';

jest.mock('../notificationService', () => ({
  notificationService: { notifyBackupCreated: jest.fn().mockResolvedValue(undefined) },
}));

describe('server-side snapshots when browser storage is full (#66)', () => {
  const fetchMock = jest.fn();
  const records = [{ name: 'example.test', type: RecordType.TXT, value: 'snapshot data', ttl: 300 }];
  const options = {
    type: 'auto' as const,
    keyId: 'example-key',
    config: { defaultServer: '192.0.2.53' } as Config,
  };

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Browser storage is full', 'QuotaExceededError');
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates an automatic pre-change snapshot without writing to browser storage', async () => {
    const backup = { id: 'server-snapshot', zone: 'example.test', timestamp: Date.now(), records };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ backup }) });

    await expect(new BackupService().createBackup('example.test', records, options)).resolves.toEqual(backup);

    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/backups/zone/example.test'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, server: '192.0.2.53', keyId: 'example-key', type: 'auto' }),
    });
  });

  it('reports a backend storage-budget rejection instead of a browser quota error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Snapshot exceeds the backup size budget' }) });

    await expect(new BackupService().createBackup('example.test', records, options))
      .rejects.toThrow('Snapshot exceeds the backup size budget');
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });
});
