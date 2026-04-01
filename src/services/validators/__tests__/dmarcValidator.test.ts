// src/services/validators/__tests__/dmarcValidator.test.ts
import { validateDmarc } from '../dmarcValidator';

describe('validateDmarc', () => {
  describe('errors (block submission)', () => {
    it('requires v=DMARC1 prefix', () => {
      const result = validateDmarc('p=reject');
      expect(result.errors).toContain('DMARC record must start with "v=DMARC1"');
    });

    it('requires p= tag', () => {
      const result = validateDmarc('v=DMARC1');
      expect(result.errors.some(e => e.includes('p='))).toBe(true);
    });

    it('rejects invalid policy value', () => {
      const result = validateDmarc('v=DMARC1; p=deny');
      expect(result.errors.some(e => e.includes('policy'))).toBe(true);
    });

    it('rejects malformed tag syntax', () => {
      const result = validateDmarc('v=DMARC1; garbage; p=reject');
      expect(result.errors.some(e => e.includes('Malformed'))).toBe(true);
    });
  });

  describe('warnings (allow submission)', () => {
    it('warns on p=none without rua', () => {
      const result = validateDmarc('v=DMARC1; p=none');
      expect(result.warnings.some(w => w.includes('rua'))).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns on pct less than 100', () => {
      const result = validateDmarc('v=DMARC1; p=reject; pct=50');
      expect(result.warnings.some(w => w.includes('pct') || w.includes('50'))).toBe(true);
    });

    it('does not warn on p=none with rua', () => {
      const result = validateDmarc('v=DMARC1; p=none; rua=mailto:dmarc@example.com');
      expect(result.warnings.filter(w => w.includes('rua'))).toHaveLength(0);
    });
  });

  describe('valid records', () => {
    it('accepts p=none', () => {
      const result = validateDmarc('v=DMARC1; p=none; rua=mailto:dmarc@example.com');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts p=quarantine', () => {
      const result = validateDmarc('v=DMARC1; p=quarantine');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts p=reject', () => {
      const result = validateDmarc('v=DMARC1; p=reject');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts full record with all optional tags', () => {
      const result = validateDmarc('v=DMARC1; p=quarantine; sp=reject; rua=mailto:a@b.com; ruf=mailto:c@d.com; pct=100; adkim=s; aspf=r');
      expect(result.errors).toHaveLength(0);
    });

    it('is case-insensitive on v=DMARC1', () => {
      const result = validateDmarc('v=dmarc1; p=reject');
      expect(result.errors).toHaveLength(0);
    });
  });
});
