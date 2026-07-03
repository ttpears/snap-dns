// backend/src/services/__tests__/dnsSafety.test.ts
import {
  assertNoControlChars,
  isValidDnsName,
  isValidZoneName,
} from '../dnsSafety';

describe('assertNoControlChars', () => {
  it('accepts ordinary presentation data', () => {
    expect(() => assertNoControlChars('v=spf1 include:_spf.example.com ~all', 'value')).not.toThrow();
    expect(() => assertNoControlChars('10 mail.example.com', 'value')).not.toThrow();
  });

  it('rejects a literal newline (the nsupdate command-file injection vector)', () => {
    expect(() => assertNoControlChars('x\nupdate delete victim.example.com', 'name')).toThrow(/name/);
  });

  it('rejects carriage return, NUL and other C0 control bytes', () => {
    expect(() => assertNoControlChars('a\rb', 'value')).toThrow();
    expect(() => assertNoControlChars('a\x00b', 'value')).toThrow();
    expect(() => assertNoControlChars('a\tb', 'value')).toThrow();
    expect(() => assertNoControlChars('a\x7fb', 'value')).toThrow();
  });
});

describe('isValidDnsName', () => {
  it('accepts ordinary owner names', () => {
    expect(isValidDnsName('www.example.com')).toBe(true);
    expect(isValidDnsName('www.example.com.')).toBe(true);
    expect(isValidDnsName('host')).toBe(true);
  });

  it('accepts service/underscore labels, wildcards and apex shorthand', () => {
    expect(isValidDnsName('_dmarc.example.com')).toBe(true);
    expect(isValidDnsName('_sip._tcp.example.com')).toBe(true);
    expect(isValidDnsName('*.example.com')).toBe(true);
    expect(isValidDnsName('@')).toBe(true);
    expect(isValidDnsName('.')).toBe(true);
  });

  it('rejects names carrying nsupdate/shell injection payloads', () => {
    expect(isValidDnsName('x\nupdate delete victim.example.com')).toBe(false);
    expect(isValidDnsName('foo 300 IN A 6.6.6.6')).toBe(false); // embedded whitespace splits tokens
    expect(isValidDnsName('a;b.example.com')).toBe(false);
    expect(isValidDnsName('$(reboot).example.com')).toBe(false);
  });

  it('enforces RFC 1035 length limits', () => {
    expect(isValidDnsName('a'.repeat(63) + '.example.com')).toBe(true);
    expect(isValidDnsName('a'.repeat(64) + '.example.com')).toBe(false); // label > 63
    expect(isValidDnsName('')).toBe(false);
    expect(isValidDnsName('a'.repeat(256))).toBe(false); // name > 255
  });

  it('rejects empty labels and misplaced wildcards', () => {
    expect(isValidDnsName('foo..example.com')).toBe(false);
    expect(isValidDnsName('foo.*.example.com')).toBe(false); // wildcard only as leftmost label
  });
});

describe('isValidZoneName', () => {
  it('accepts real zones with or without a trailing dot', () => {
    expect(isValidZoneName('example.com')).toBe(true);
    expect(isValidZoneName('example.com.')).toBe(true);
    expect(isValidZoneName('2.0.192.in-addr.arpa')).toBe(true);
  });

  it('rejects apex shorthand, wildcards and injection payloads', () => {
    expect(isValidZoneName('@')).toBe(false);
    expect(isValidZoneName('*.example.com')).toBe(false);
    expect(isValidZoneName('example.com; rm -rf /')).toBe(false);
    expect(isValidZoneName('example.com\nsend')).toBe(false);
    expect(isValidZoneName('')).toBe(false);
  });
});
