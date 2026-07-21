// src/services/__tests__/dnsService.applyBatch.test.ts
import { dnsService, type BatchChange, type DNSRecord } from '../dnsService';

describe('dnsService.applyBatch (frontend client)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, warnings: ['w1'] }),
    });
  });

  it('POSTs all changes to the batch endpoint and returns warnings', async () => {
    const changes: BatchChange[] = [
      { op: 'add', record: { name: 'a', type: 'A', value: '1.1.1.1', ttl: 300 } as DNSRecord },
      { op: 'delete', record: { name: 'b', type: 'A', value: '2.2.2.2', ttl: 300 } as DNSRecord },
      {
        op: 'update',
        oldRecord: { name: 'c', type: 'A', value: '3.3.3.3', ttl: 300 } as DNSRecord,
        newRecord: { name: 'c', type: 'A', value: '4.4.4.4', ttl: 300 } as DNSRecord,
      },
    ];

    const result = await dnsService.applyBatch('example.com', changes, 'key-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/zones/example.com/records/batch');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    // The selected key/view must accompany the batch so the backend targets it.
    expect(body.keyId).toBe('key-123');
    expect(body.changes).toHaveLength(3);
    expect(body.changes[0].op).toBe('add');
    expect(body.changes[2].op).toBe('update');
    expect(body.changes[2].oldRecord.value).toBe('3.3.3.3');
    expect(result.warnings).toEqual(['w1']);
  });

  it('rejects an empty change set without calling the API', async () => {
    await expect(dnsService.applyBatch('example.com', [], 'key-123')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a batch with no keyId without calling the API', async () => {
    const changes: BatchChange[] = [
      { op: 'add', record: { name: 'a', type: 'A', value: '1.1.1.1', ttl: 300 } as DNSRecord },
    ];
    await expect(dnsService.applyBatch('example.com', changes, '')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
