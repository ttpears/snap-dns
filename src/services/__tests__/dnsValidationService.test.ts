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
});
