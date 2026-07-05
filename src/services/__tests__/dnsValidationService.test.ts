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

  describe('DNSKEY / CDNSKEY structured validation', () => {
    const key = 'mdsswUyr3DPW132mOi8V9xESWE8jTo0dxCjjnopKl+GqJxpVXckHAeF+KkxLbxILfDLUT0rAK9iUzy1L53eKGQ==';

    it('accepts a well-formed KSK DNSKEY with no warnings', () => {
      const res = validate({ type: 'DNSKEY', value: `257 3 13 ${key}` });
      expect(res.isValid).toBe(true);
      expect(res.warnings).toHaveLength(0);
    });

    it('tolerates whitespace groups inside the base64 key', () => {
      expect(validate({ type: 'DNSKEY', value: '256 3 8 AwEAAa4h f1 Qz' }).isValid).toBe(true);
    });

    it('rejects a protocol other than 3 (RFC 4034 §2.1.2)', () => {
      const res = validate({ type: 'DNSKEY', value: `257 2 13 ${key}` });
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => /protocol must be 3/.test(e))).toBe(true);
    });

    it('rejects a non-base64 or missing public key', () => {
      expect(validate({ type: 'DNSKEY', value: '257 3 13 not*base64!' }).isValid).toBe(false);
      expect(validate({ type: 'DNSKEY', value: '257 3 13' }).isValid).toBe(false);
    });

    it('rejects out-of-range flags and algorithm', () => {
      expect(validate({ type: 'DNSKEY', value: `70000 3 13 ${key}` }).isValid).toBe(false);
      expect(validate({ type: 'DNSKEY', value: `257 3 999 ${key}` }).isValid).toBe(false);
    });

    it('warns on unusual-but-legal flags values', () => {
      const res = validate({ type: 'DNSKEY', value: `1 3 13 ${key}` });
      expect(res.isValid).toBe(true);
      expect(res.warnings.some(w => /flags is normally 0, 256/.test(w))).toBe(true);
    });

    it('validates CDNSKEY identically', () => {
      expect(validate({ type: 'CDNSKEY', value: `257 3 13 ${key}` }).isValid).toBe(true);
      expect(validate({ type: 'CDNSKEY', value: `257 1 13 ${key}` }).isValid).toBe(false);
    });
  });

  describe('NAPTR structured validation', () => {
    it('accepts a classic terminal SIP NAPTR with no warnings', () => {
      const res = validate({ type: 'NAPTR', value: '100 10 "S" "SIP+D2U" "" _sip._udp.example.com.' });
      expect(res.isValid).toBe(true);
      expect(res.warnings).toHaveLength(0);
    });

    it('accepts a regexp NAPTR with "." replacement', () => {
      const res = validate({ type: 'NAPTR', value: '100 50 "u" "E2U+sip" "!^.*$!sip:info@example.com!" .' });
      expect(res.isValid).toBe(true);
      expect(res.warnings).toHaveLength(0);
    });

    it('rejects unquoted flags/service/regexp fields', () => {
      expect(validate({ type: 'NAPTR', value: '100 10 S SIP+D2U "" .' }).isValid).toBe(false);
    });

    it('rejects non-numeric order and out-of-range preference', () => {
      expect(validate({ type: 'NAPTR', value: 'abc 10 "S" "" "" .' }).isValid).toBe(false);
      expect(validate({ type: 'NAPTR', value: '100 70000 "S" "" "" .' }).isValid).toBe(false);
    });

    it('rejects a non-alphanumeric flags charset and a bad replacement', () => {
      expect(validate({ type: 'NAPTR', value: '100 10 "S!" "" "" .' }).isValid).toBe(false);
      expect(validate({ type: 'NAPTR', value: '100 10 "S" "" "" bad..host' }).isValid).toBe(false);
    });

    it('warns (but accepts) when both regexp and replacement are set', () => {
      const res = validate({ type: 'NAPTR', value: '100 10 "u" "E2U+sip" "!a!b!" example.com.' });
      expect(res.isValid).toBe(true);
      expect(res.warnings.some(w => /mutually exclusive/.test(w))).toBe(true);
    });
  });

  describe('SVCB / HTTPS structured validation', () => {
    it('accepts AliasMode and ServiceMode records', () => {
      expect(validate({ type: 'SVCB', value: '0 svc.example.com.' }).isValid).toBe(true);
      const res = validate({ type: 'HTTPS', value: '1 . alpn=h2,h3 port=443' });
      expect(res.isValid).toBe(true);
      expect(res.warnings).toHaveLength(0);
    });

    it('rejects a bad priority or target', () => {
      expect(validate({ type: 'SVCB', value: '70000 .' }).isValid).toBe(false);
      expect(validate({ type: 'SVCB', value: '1 bad..host' }).isValid).toBe(false);
    });

    it('rejects malformed param values (port, ipv4hint, ipv6hint)', () => {
      expect(validate({ type: 'HTTPS', value: '1 . port=abc' }).isValid).toBe(false);
      expect(validate({ type: 'HTTPS', value: '1 . ipv4hint=1.2.3.999' }).isValid).toBe(false);
      expect(validate({ type: 'HTTPS', value: '1 . ipv6hint=zzzz' }).isValid).toBe(false);
    });

    it('accepts well-formed address hints (reusing IPv4/IPv6 validators)', () => {
      expect(
        validate({ type: 'HTTPS', value: '1 . ipv4hint=192.0.2.1,192.0.2.2 ipv6hint=2001:db8::1' }).isValid
      ).toBe(true);
    });

    it('rejects a value on no-default-alpn and duplicate keys', () => {
      expect(validate({ type: 'SVCB', value: '1 . no-default-alpn=x' }).isValid).toBe(false);
      expect(validate({ type: 'SVCB', value: '1 . port=443 port=444' }).isValid).toBe(false);
    });

    it('allows keyNNNNN params and warns on other unknown keys', () => {
      const generic = validate({ type: 'SVCB', value: '1 . key65280=foo' });
      expect(generic.isValid).toBe(true);
      expect(generic.warnings).toHaveLength(0);
      expect(validate({ type: 'SVCB', value: '1 . key99999=x' }).isValid).toBe(false);
      const unknown = validate({ type: 'SVCB', value: '1 . fancy=1' });
      expect(unknown.isValid).toBe(true);
      expect(unknown.warnings.some(w => /Unrecognised SVCB SvcParam/.test(w))).toBe(true);
    });

    it('warns when AliasMode (priority 0) carries params (RFC 9460 §2.4.2)', () => {
      const res = validate({ type: 'HTTPS', value: '0 . alpn=h2' });
      expect(res.isValid).toBe(true);
      expect(res.warnings.some(w => /AliasMode/.test(w))).toBe(true);
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
