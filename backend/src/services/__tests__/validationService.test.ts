// backend/src/services/__tests__/validationService.test.ts
import { validationService } from '../validationService';

const base = { name: 'host', ttl: 300 };
const validate = (over: Record<string, unknown>) =>
  validationService.validateRecord({ ...base, ...over }, 'example.com');

describe('validationService.validateRecord', () => {
  describe('required fields', () => {
    it('rejects a missing record', () => {
      expect(validationService.validateRecord(null, 'example.com').isValid).toBe(false);
    });

    it('requires name, value and ttl', () => {
      // ttl omitted entirely — note ttl:0 is valid (RFC 2181), so a missing TTL
      // must be undefined, not falsy 0, to trigger the "required" error.
      const res = validationService.validateRecord(
        { type: 'A', value: '' },
        'example.com'
      );
      expect(res.isValid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          'Record name is required',
          'Record value is required',
          'TTL is required',
        ])
      );
    });

    it('rejects an out-of-range TTL', () => {
      const res = validate({ type: 'A', value: '1.2.3.4', ttl: 3000000000 });
      expect(res.errors).toContain('TTL must be between 0 and 2147483647');
    });
  });

  describe('plain TXT records', () => {
    it('accepts clean single-segment text', () => {
      expect(validate({ type: 'TXT', value: 'some plain text record' }).isValid).toBe(true);
    });

    it('accepts a clean multi-segment array', () => {
      expect(validate({ type: 'TXT', value: ['segment one', 'segment two'] }).isValid).toBe(true);
    });

    it('rejects a segment over 255 bytes', () => {
      const res = validate({ type: 'TXT', value: 'a'.repeat(256) });
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => /exceeds 255 bytes/.test(e))).toBe(true);
    });

    it('counts bytes, not characters, against the 255 limit', () => {
      // 128 two-byte characters = 256 bytes but only 128 chars.
      const res = validate({ type: 'TXT', value: 'é'.repeat(128) });
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => /exceeds 255 bytes/.test(e))).toBe(true);
    });

    it('accepts quotes and backslashes as legal TXT data', () => {
      // Quoting is a presentation concern added once at the nsupdate boundary,
      // so raw quotes/backslashes in the logical value must not be rejected.
      expect(validate({ type: 'TXT', value: 'has "quotes"' }).isValid).toBe(true);
      expect(validate({ type: 'TXT', value: 'back\\slash' }).isValid).toBe(true);
    });

    it('rejects control characters', () => {
      expect(validate({ type: 'TXT', value: 'bad\x01char' }).isValid).toBe(false);
    });

    it('enforces the 255-byte limit even for recognised subtypes (e.g. long DKIM)', () => {
      const res = validate({ type: 'TXT', name: 'sel._domainkey', value: 'v=DKIM1; k=rsa; p=' + 'A'.repeat(300) });
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => /exceeds 255 bytes/.test(e))).toBe(true);
    });

    it('rejects a non-string, non-array value', () => {
      const res = validate({ type: 'TXT', value: 42 });
      expect(res.errors).toContain('Invalid TXT record format');
    });
  });

  describe('A records', () => {
    it.each(['192.168.1.1', '0.0.0.0', '255.255.255.255'])('accepts %s', ip => {
      expect(validate({ type: 'A', value: ip }).isValid).toBe(true);
    });

    it.each(['999.1.1.1', '1.2.3', 'abc', '1.2.3.4.5'])('rejects %s', ip => {
      expect(validate({ type: 'A', value: ip }).isValid).toBe(false);
    });
  });

  describe('AAAA records (compressed + mapped notation)', () => {
    it.each([
      '2001:0db8:0000:0000:0000:0000:0000:0001',
      '2001:db8::1',
      '::1',
      '::',
      '::ffff:192.168.1.1',
      'fe80::1',
    ])('accepts %s', ip => {
      expect(validate({ type: 'AAAA', value: ip }).isValid).toBe(true);
    });

    it.each([
      'gggg::1',
      '2001:db8:::1',
      '12345::1',
      'not-an-ip',
      '::ffff:999.1.1.1',
    ])('rejects %s', ip => {
      expect(validate({ type: 'AAAA', value: ip }).isValid).toBe(false);
    });
  });

  describe('MX / SRV / CAA', () => {
    it('accepts a valid MX and rejects a malformed one', () => {
      expect(validate({ type: 'MX', value: '10 mail.example.com' }).isValid).toBe(true);
      expect(validate({ type: 'MX', value: 'mail.example.com' }).isValid).toBe(false);
      expect(validate({ type: 'MX', value: 'abc mail.example.com' }).isValid).toBe(false);
    });

    it('accepts a valid SRV and rejects a malformed one', () => {
      expect(validate({ type: 'SRV', value: '10 20 5060 sip.example.com' }).isValid).toBe(true);
      expect(validate({ type: 'SRV', value: '10 20 sip.example.com' }).isValid).toBe(false);
    });

    it('accepts a valid CAA and rejects malformed flags/tag', () => {
      expect(validate({ type: 'CAA', value: '0 issue "letsencrypt.org"' }).isValid).toBe(true);
      expect(validate({ type: 'CAA', value: '999 issue x' }).isValid).toBe(false); // flags > 255
      expect(validate({ type: 'CAA', value: '0 bad-tag! x' }).isValid).toBe(false); // malformed tag
    });

    it('accepts IANA-registered CAA tags (contactemail) that used to be rejected', () => {
      expect(validate({ type: 'CAA', value: '0 contactemail "admin@example.com"' }).isValid).toBe(true);
    });

    it('accepts a well-formed but unregistered CAA tag with a warning (RFC 8659 extensible)', () => {
      const res = validate({ type: 'CAA', value: '0 futuretag x' });
      expect(res.isValid).toBe(true);
      expect(res.warnings.some(w => /Unrecognised CAA tag/.test(w))).toBe(true);
    });

    it('accepts the null MX target "." (RFC 7505)', () => {
      expect(validate({ type: 'MX', value: '0 .' }).isValid).toBe(true);
    });

    it('accepts the null SRV target "." (RFC 2782)', () => {
      expect(validate({ type: 'SRV', value: '0 0 0 .' }).isValid).toBe(true);
    });
  });

  describe('additional record types (generic presentation format)', () => {
    it('accepts a non-empty presentation value for a generic type (TLSA/DS)', () => {
      expect(validate({ type: 'TLSA', value: '3 0 1 abcdef0123456789' }).isValid).toBe(true);
      expect(validate({ type: 'DS', value: '12345 8 2 49FD46E6C4B45C55D4AC' }).isValid).toBe(true);
      expect(validate({ type: 'SVCB', value: '1 . alpn=h2,h3' }).isValid).toBe(true);
    });

    it('still requires a value for a generic type', () => {
      expect(validate({ type: 'TLSA', value: '' }).isValid).toBe(false);
    });

    it('validates DNAME as a domain-name target', () => {
      expect(validate({ type: 'DNAME', value: 'target.example.net.' }).isValid).toBe(true);
      expect(validate({ type: 'DNAME', value: 'not a hostname' }).isValid).toBe(false);
    });

    it('structurally validates DS/CDS (numeric fields + hex digest)', () => {
      expect(validate({ type: 'DS', value: '12345 8 2 49FD46E6C4B4' }).isValid).toBe(true);
      expect(validate({ type: 'DS', value: '12345 8 2 XYZnothex' }).isValid).toBe(false); // digest not hex
      expect(validate({ type: 'DS', value: '99999999 8 2 ABCD' }).isValid).toBe(false); // key-tag > 65535
      expect(validate({ type: 'CDS', value: '12345 8 2 ABCD' }).isValid).toBe(true);
    });

    it('structurally validates TLSA/SMIMEA (numeric fields + hex cert)', () => {
      expect(validate({ type: 'TLSA', value: '3 0 1 ABCDEF0123' }).isValid).toBe(true);
      expect(validate({ type: 'TLSA', value: '3 0 1 nothex!!' }).isValid).toBe(false);
      expect(validate({ type: 'TLSA', value: '3 0' }).isValid).toBe(false); // too few fields
      expect(validate({ type: 'SMIMEA', value: '3 0 1 ABCD' }).isValid).toBe(true);
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

  describe('RFC edge cases (G5)', () => {
    it('accepts TTL 0 (RFC 2181 §8)', () => {
      const res = validationService.validateRecord({ name: 'host', type: 'A', value: '1.2.3.4', ttl: 0 }, 'example.com');
      expect(res.isValid).toBe(true);
    });
  });

  describe('false-accepts tightened (G7)', () => {
    it('rejects IPv4 octets with leading zeros', () => {
      expect(validate({ type: 'A', value: '192.168.001.1' }).isValid).toBe(false);
    });

    it('rejects non-numeric MX priority and SRV fields', () => {
      expect(validate({ type: 'MX', value: '10x mail.example.com' }).isValid).toBe(false);
      expect(validate({ type: 'SRV', value: '10 20 5060x sip.example.com' }).isValid).toBe(false);
    });

    it('accepts a general embedded-IPv4 IPv6 form (NAT64 64:ff9b::/96)', () => {
      expect(validate({ type: 'AAAA', value: '64:ff9b::192.0.2.1' }).isValid).toBe(true);
    });

    it('rejects a hostname longer than 255 octets', () => {
      const long = Array(20).fill('abcdefghijkl').join('.') + '.example.com'; // > 255 chars
      expect(validate({ type: 'CNAME', value: long }).isValid).toBe(false);
    });
  });

  describe('CNAME hostname validation', () => {
    it('accepts a valid target and rejects an invalid one', () => {
      expect(validate({ type: 'CNAME', value: 'target.example.com.' }).isValid).toBe(true);
      expect(validate({ type: 'CNAME', value: 'bad host!' }).isValid).toBe(false);
    });
  });
});
