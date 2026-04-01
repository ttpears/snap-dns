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

    it('rejects duplicate mechanisms', () => {
      const result = validateSpf('v=spf1 ip4:1.2.3.4 ip4:1.2.3.4 ~all');
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
  });

  describe('warnings (allow submission)', () => {
    it('warns on +all', () => {
      const result = validateSpf('v=spf1 mx +all');
      expect(result.warnings.some(w => w.includes('+all'))).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns when DNS lookup count exceeds 10', () => {
      const mechanisms = Array.from({ length: 11 }, (_, i) => `include:d${i}.example.com`);
      const result = validateSpf(`v=spf1 ${mechanisms.join(' ')} ~all`);
      expect(result.warnings.some(w => w.includes('10'))).toBe(true);
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
  });
});
