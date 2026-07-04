// src/services/__tests__/dnsValidationService.test.ts
import { DNSValidationService } from '../dnsValidationService';

const validate = (over: Record<string, unknown>) =>
  DNSValidationService.validateRecord({ name: 'host', ttl: 300, ...over }, 'example.com');

describe('DNSValidationService (G5 RFC edge cases)', () => {
  it('accepts TTL 0 (RFC 2181 §8)', () => {
    expect(validate({ type: 'A', value: '1.2.3.4', ttl: 0 }).isValid).toBe(true);
  });

  it('still flags a truly missing TTL', () => {
    expect(validate({ type: 'A', value: '1.2.3.4', ttl: undefined }).errors).toContain('TTL is required');
  });

  describe('names', () => {
    it('accepts a bare wildcard owner', () => {
      expect(validate({ name: '*', type: 'A', value: '1.2.3.4' }).isValid).toBe(true);
    });

    it('accepts underscore service labels in the owner name', () => {
      expect(validate({ name: '_acme-challenge', type: 'CNAME', value: 'x.example.net.' }).isValid).toBe(true);
      expect(validate({ name: 'sel._domainkey', type: 'CNAME', value: 'x.example.net.' }).isValid).toBe(true);
    });

    it('accepts an underscore-labelled CNAME target (ACME/DKIM delegation)', () => {
      expect(
        validate({ name: '_acme-challenge', type: 'CNAME', value: '_acme.example.net.' }).isValid
      ).toBe(true);
    });
  });

  describe('AAAA', () => {
    it.each(['::1', '2001:db8::1', '::', '::ffff:192.0.2.1'])('accepts %s', ip => {
      expect(validate({ type: 'AAAA', value: ip }).isValid).toBe(true);
    });
  });

  describe('null targets', () => {
    it('accepts the null MX "0 ." (RFC 7505)', () => {
      expect(validate({ type: 'MX', value: '0 .' }).isValid).toBe(true);
    });

    it('accepts the null SRV target "." (RFC 2782)', () => {
      expect(validate({ type: 'SRV', value: '0 0 0 .' }).isValid).toBe(true);
    });
  });

  describe('DS / TLSA structured validation', () => {
    it('accepts well-formed DS and rejects a bad digest / oversized key-tag', () => {
      expect(validate({ type: 'DS', value: '12345 8 2 49FD46E6C4B4' }).isValid).toBe(true);
      expect(validate({ type: 'DS', value: '12345 8 2 nothex!' }).isValid).toBe(false);
      expect(validate({ type: 'DS', value: '99999999 8 2 ABCD' }).isValid).toBe(false);
    });

    it('accepts well-formed TLSA and rejects too-few fields / non-hex cert', () => {
      expect(validate({ type: 'TLSA', value: '3 0 1 ABCDEF' }).isValid).toBe(true);
      expect(validate({ type: 'TLSA', value: '3 0 1 zz' }).isValid).toBe(false);
      expect(validate({ type: 'TLSA', value: '3 0' }).isValid).toBe(false);
    });
  });

  describe('NS records', () => {
    it('accepts a valid nameserver and rejects a malformed one', () => {
      expect(validate({ type: 'NS', value: 'ns1.example.com.' }).isValid).toBe(true);
      expect(validate({ type: 'NS', value: 'not a hostname' }).isValid).toBe(false);
    });
  });

  describe('false-accepts tightened (G7)', () => {
    it('rejects IPv4 octets with leading zeros', () => {
      expect(validate({ type: 'A', value: '192.168.001.1' }).isValid).toBe(false);
      expect(validate({ type: 'A', value: '10.0.0.0' }).isValid).toBe(true);
    });

    it('rejects non-numeric MX/SRV integer fields', () => {
      expect(validate({ type: 'MX', value: '10x mail.example.com' }).isValid).toBe(false);
      expect(validate({ type: 'SRV', value: '10 20 5060x sip.example.com' }).isValid).toBe(false);
    });

    it('accepts a general embedded-IPv4 IPv6 form (64:ff9b::/96 NAT64)', () => {
      expect(validate({ type: 'AAAA', value: '64:ff9b::192.0.2.1' }).isValid).toBe(true);
    });

    it('rejects an over-length name (>255 octets)', () => {
      const long = Array(20).fill('abcdefghijkl').join('.') + '.example.com';
      expect(validate({ type: 'CNAME', value: long }).isValid).toBe(false);
    });
  });
});
