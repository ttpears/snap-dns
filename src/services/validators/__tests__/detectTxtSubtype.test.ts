// src/services/validators/__tests__/detectTxtSubtype.test.ts
import { detectTxtSubtype } from '../detectTxtSubtype';

describe('detectTxtSubtype', () => {
  describe('SPF detection', () => {
    it('detects v=spf1 prefix', () => {
      expect(detectTxtSubtype('v=spf1 include:example.com ~all')).toBe('spf');
    });

    it('detects case-insensitive', () => {
      expect(detectTxtSubtype('V=SPF1 mx ~all')).toBe('spf');
    });

    it('does not match v=spf2 or partial', () => {
      expect(detectTxtSubtype('v=spf2 mx')).toBeNull();
      expect(detectTxtSubtype('some text v=spf1')).toBeNull();
    });
  });

  describe('DKIM detection', () => {
    it('detects v=DKIM1 in value', () => {
      expect(detectTxtSubtype('v=DKIM1; k=rsa; p=ABC123')).toBe('dkim');
    });

    it('detects case-insensitive', () => {
      expect(detectTxtSubtype('v=dkim1; k=rsa; p=ABC')).toBe('dkim');
    });

    it('detects by record name with _domainkey', () => {
      expect(detectTxtSubtype('k=rsa; p=ABC', 'selector1._domainkey')).toBe('dkim');
    });

    it('detects by record name with _domainkey subdomain', () => {
      expect(detectTxtSubtype('k=rsa; p=ABC', 'selector1._domainkey.example')).toBe('dkim');
    });
  });

  describe('DMARC detection', () => {
    it('detects v=DMARC1 prefix', () => {
      expect(detectTxtSubtype('v=DMARC1; p=reject; rua=mailto:dmarc@example.com')).toBe('dmarc');
    });

    it('detects case-insensitive', () => {
      expect(detectTxtSubtype('v=dmarc1; p=none')).toBe('dmarc');
    });

    it('detects by record name _dmarc', () => {
      expect(detectTxtSubtype('p=reject', '_dmarc')).toBe('dmarc');
    });
  });

  describe('no match', () => {
    it('returns null for plain TXT', () => {
      expect(detectTxtSubtype('just a plain text record')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectTxtSubtype('')).toBeNull();
    });

    it('returns null for google verification', () => {
      expect(detectTxtSubtype('google-site-verification=abc123')).toBeNull();
    });
  });
});
