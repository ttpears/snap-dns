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

describe('DNSRecordFormatter CAA handling', () => {
  const caa = (value: string) =>
    DNSRecordFormatter.formatRecord(
      { name: '@', type: 'CAA', value, ttl: 300 } as unknown as DNSRecord,
      'example.com'
    ).value;

  it('quotes the value exactly once (no literal quote bytes in RDATA)', () => {
    // Unquoted input, as getRecordForSubmission now produces.
    expect(caa('0 issue letsencrypt.org')).toBe('0 issue "letsencrypt.org"');
  });

  it('does not double-quote an already-quoted value', () => {
    expect(caa('0 issue "letsencrypt.org"')).toBe('0 issue "letsencrypt.org"');
  });

  it('preserves a value containing spaces instead of truncating it', () => {
    expect(caa('0 issue ca.example.com; account=123456')).toBe(
      '0 issue "ca.example.com; account=123456"'
    );
  });

  it('escapes embedded quotes in the value', () => {
    expect(caa('0 iodef mailto:a@b."x"')).toBe('0 iodef "mailto:a@b.\\"x\\""');
  });

  it('canonicalizeCaaValue quotes an unquoted edited value and is idempotent', () => {
    // The edit path (RecordEditor) uses this so a hand-edited CAA value gets the
    // same one-time quoting the add path applies.
    expect(DNSRecordFormatter.canonicalizeCaaValue('0 issue sectigo.com')).toBe('0 issue "sectigo.com"');
    expect(DNSRecordFormatter.canonicalizeCaaValue('0 issue "letsencrypt.org"')).toBe('0 issue "letsencrypt.org"');
  });
});

describe('DNSRecordFormatter.qualifyName', () => {
  const q = DNSRecordFormatter.qualifyName;

  it('appends the zone to an unqualified name', () => {
    expect(q('www', 'example.com')).toBe('www.example.com');
  });

  it('does not re-append when the name is already an FQDN under the zone', () => {
    expect(q('www.example.com', 'example.com')).toBe('www.example.com');
    expect(q('www.example.com.', 'example.com')).toBe('www.example.com'); // trailing dot
    expect(q('example.com', 'example.com')).toBe('example.com'); // apex
  });

  it('qualifies a name that only shares a suffix (label boundary)', () => {
    expect(q('notexample.com', 'example.com')).toBe('notexample.com.example.com');
  });

  it('is case-insensitive when matching the zone', () => {
    expect(q('WWW.Example.COM', 'example.com')).toBe('WWW.Example.COM');
  });

  it('handles wildcards without double-appending the zone', () => {
    expect(q('*', 'example.com')).toBe('*.example.com');
    expect(q('*.dev', 'example.com')).toBe('*.dev.example.com');
    expect(q('*.example.com', 'example.com')).toBe('*.example.com');
  });
});

describe('DNSRecordFormatter AAAA handling', () => {
  const aaaa = (value: string) =>
    DNSRecordFormatter.formatRecord(
      { name: 'host', type: 'AAAA', value, ttl: 300 } as unknown as DNSRecord,
      'example.com'
    ).value;

  it('accepts compressed and IPv4-mapped IPv6 forms', () => {
    expect(aaaa('::1')).toBe('::1');
    expect(aaaa('2001:db8::1')).toBe('2001:db8::1');
    expect(aaaa('::ffff:192.0.2.1')).toBe('::ffff:192.0.2.1');
  });

  it('lowercases the address (RFC 5952)', () => {
    expect(aaaa('2001:DB8::AbCd')).toBe('2001:db8::abcd');
  });

  it('rejects a malformed address', () => {
    expect(() => aaaa('gggg::1')).toThrow(/IPv6/);
  });
});

describe('DNSRecordFormatter PTR handling', () => {
  const ptrName = (name: string, zone: string) =>
    DNSRecordFormatter.formatRecord(
      { name, type: 'PTR', value: 'host.example.com.', ttl: 300 } as unknown as DNSRecord,
      zone
    ).name;

  it('reverses a full IPv4 address into an in-addr.arpa name under the zone', () => {
    expect(ptrName('192.0.2.5', '2.0.192.in-addr.arpa')).toBe('5.2.0.192.in-addr.arpa.');
  });

  it('qualifies a host-relative octet against the reverse zone', () => {
    expect(ptrName('5', '2.0.192.in-addr.arpa')).toBe('5.2.0.192.in-addr.arpa.');
  });

  it('leaves an already-qualified reverse name intact', () => {
    expect(ptrName('5.2.0.192.in-addr.arpa', '2.0.192.in-addr.arpa')).toBe(
      '5.2.0.192.in-addr.arpa.'
    );
  });
});
