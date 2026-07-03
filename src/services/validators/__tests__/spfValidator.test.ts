// src/services/validators/__tests__/spfValidator.test.ts
import { validateSpf } from '../spfValidator';

describe('validateSpf', () => {
  describe('errors (block submission)', () => {
    it('requires v=spf1 prefix', () => {
      const result = validateSpf('ip4:1.2.3.4 ~all');
      expect(result.errors).toContain('SPF record must start with "v=spf1"');
    });

    it('rejects unknown mechanisms', () => {
      const result = validateSpf('v=spf1 bogus:foo ~all');
      expect(result.errors.some(e => e.includes('Unknown mechanism'))).toBe(true);
    });

    it('rejects invalid IPv4 in ip4 mechanism', () => {
      const result = validateSpf('v=spf1 ip4:999.999.999.999 ~all');
      expect(result.errors.some(e => e.includes('Invalid IPv4'))).toBe(true);
    });

    it('rejects invalid CIDR in ip4 mechanism', () => {
      const result = validateSpf('v=spf1 ip4:1.2.3.0/33 ~all');
      expect(result.errors.some(e => e.includes('CIDR'))).toBe(true);
    });

    it('rejects invalid IPv6 in ip6 mechanism', () => {
      const result = validateSpf('v=spf1 ip6:not-an-ipv6 ~all');
      expect(result.errors.some(e => e.includes('Invalid IPv6'))).toBe(true);
    });

    it('rejects invalid CIDR in ip6 mechanism', () => {
      const result = validateSpf('v=spf1 ip6:2001:db8::/129 ~all');
      expect(result.errors.some(e => e.includes('CIDR'))).toBe(true);
    });

    it('flags more than 10 DNS lookups as an error (RFC 7208 §4.6.4 permerror)', () => {
      const mechanisms = Array.from({ length: 11 }, (_, i) => `include:d${i}.example.com`);
      const result = validateSpf(`v=spf1 ${mechanisms.join(' ')} ~all`);
      expect(result.errors.some(e => e.includes('permerror'))).toBe(true);
    });
  });

  describe('warnings (allow submission)', () => {
    it('warns on +all', () => {
      const result = validateSpf('v=spf1 mx +all');
      expect(result.warnings.some(w => w.includes('+all'))).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns (does not reject) on a duplicate mechanism', () => {
      const result = validateSpf('v=spf1 ip4:1.2.3.4 ip4:1.2.3.4 ~all');
      expect(result.warnings.some(w => w.includes('Duplicate'))).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns on ptr mechanism', () => {
      const result = validateSpf('v=spf1 ptr ~all');
      expect(result.warnings.some(w => w.includes('ptr') || w.includes('deprecated'))).toBe(true);
    });
  });

  describe('valid records', () => {
    it('accepts a basic SPF record', () => {
      const result = validateSpf('v=spf1 mx a ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts ip4 with CIDR', () => {
      const result = validateSpf('v=spf1 ip4:192.168.1.0/24 -all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts ip6 with CIDR', () => {
      const result = validateSpf('v=spf1 ip6:2001:db8::/32 -all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts include mechanism', () => {
      const result = validateSpf('v=spf1 include:_spf.google.com ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts qualifiers on mechanisms', () => {
      const result = validateSpf('v=spf1 +mx -ip4:1.2.3.4 ?a ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('is case-insensitive on v=spf1', () => {
      const result = validateSpf('V=SPF1 mx ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts the redirect= modifier (RFC 7208 §6)', () => {
      const result = validateSpf('v=spf1 redirect=_spf.example.com');
      expect(result.errors).toHaveLength(0);
    });

    it('counts redirect= toward the 10 DNS-lookup limit', () => {
      const includes = Array.from({ length: 10 }, (_, i) => `include:d${i}.example.com`).join(' ');
      // 10 includes + redirect = 11 lookups → permerror
      const result = validateSpf(`v=spf1 ${includes} redirect=_spf.example.com`);
      expect(result.errors.some(e => e.includes('permerror'))).toBe(true);
    });

    it('accepts the exp= modifier and ignores unknown modifiers', () => {
      const result = validateSpf('v=spf1 mx exp=explain.example.com custom=value -all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts CIDR forms on a and mx mechanisms (RFC 7208 §5.3/§5.4)', () => {
      expect(validateSpf('v=spf1 a/24 mx/24 -all').errors).toHaveLength(0);
      expect(validateSpf('v=spf1 a:example.com/24 -all').errors).toHaveLength(0);
    });
  });
});
