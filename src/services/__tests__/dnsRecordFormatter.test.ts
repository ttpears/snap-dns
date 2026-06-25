// src/services/__tests__/dnsRecordFormatter.test.ts
import { DNSRecordFormatter } from '../dnsRecordFormatter';
import { DNSRecord } from '../../types/dns';

describe('DNSRecordFormatter TXT handling', () => {
  it('preserves multi-segment TXT arrays without flattening', () => {
    // A TXT value longer than 255 bytes is chunked into a string[] upstream.
    // Each segment must survive formatting so it can be quoted independently
    // ("seg1" "seg2") rather than collapsed into one oversized string.
    const record = {
      name: 'sel',
      type: 'TXT',
      value: ['segment-one', 'segment-two'],
      ttl: 300,
    } as unknown as DNSRecord;

    const out = DNSRecordFormatter.formatRecord(record, 'example.com');

    expect(out.value).toEqual(['segment-one', 'segment-two']);
  });

  it('passes single-segment TXT strings through unchanged', () => {
    const record = {
      name: 'sel',
      type: 'TXT',
      value: 'v=spf1 -all',
      ttl: 300,
    } as unknown as DNSRecord;

    const out = DNSRecordFormatter.formatRecord(record, 'example.com');

    expect(out.value).toBe('v=spf1 -all');
  });
});
