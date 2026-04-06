// src/services/validators/__tests__/dkimValidator.test.ts
import { validateDkim } from '../dkimValidator';

describe('validateDkim', () => {
  describe('errors (block submission)', () => {
    it('requires v=DKIM1', () => {
      const result = validateDkim('k=rsa; p=ABC123');
      expect(result.errors).toContain('DKIM record must contain "v=DKIM1"');
    });

    it('requires p= tag', () => {
      const result = validateDkim('v=DKIM1; k=rsa');
      expect(result.errors.some(e => e.includes('p='))).toBe(true);
    });

    it('rejects invalid base64 in p= tag', () => {
      const result = validateDkim('v=DKIM1; k=rsa; p=not valid base64!!!');
      expect(result.errors.some(e => e.includes('base64'))).toBe(true);
    });

    it('rejects malformed tag syntax', () => {
      const result = validateDkim('v=DKIM1; garbage without equals; p=ABC');
      expect(result.errors.some(e => e.includes('Malformed'))).toBe(true);
    });
  });

  describe('warnings (allow submission)', () => {
    it('warns on empty p= (revocation record)', () => {
      const result = validateDkim('v=DKIM1; p=');
      expect(result.warnings.some(w => w.includes('revocation'))).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('valid records', () => {
    it('accepts a standard DKIM record', () => {
      const result = validateDkim('v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ==');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts ed25519 algorithm', () => {
      const result = validateDkim('v=DKIM1; k=ed25519; p=ABCDEF0123456789');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts optional t= and s= tags', () => {
      const result = validateDkim('v=DKIM1; k=rsa; t=y:s; s=email; p=ABCD');
      expect(result.errors).toHaveLength(0);
    });

    it('is case-insensitive on v=DKIM1', () => {
      const result = validateDkim('v=dkim1; k=rsa; p=ABCD');
      expect(result.errors).toHaveLength(0);
    });

    it('handles whitespace between tags', () => {
      const result = validateDkim('v=DKIM1;  k=rsa;  p=ABCD1234');
      expect(result.errors).toHaveLength(0);
    });
  });
});
