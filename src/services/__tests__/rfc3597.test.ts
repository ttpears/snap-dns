// src/services/__tests__/rfc3597.test.ts
// Frontend mirror of the RFC 3597 unknown-type validation: validator helpers,
// the DNSValidationService unknown-type branch, and the shared value hint.
import { isUnknownRecordType, looksLikeUnknownRecordType, validateRfc3597Rdata } from '../validators/rfc3597';
import { DNSValidationService } from '../dnsValidationService';
import { getValueFieldHint, RFC3597_VALUE_HINT, VALUE_FIELD_HINTS } from '../recordTypeHints';

describe('isUnknownRecordType', () => {
  it.each(['TYPE1', 'TYPE65534', 'TYPE65535'])('accepts %s', (t) => {
    expect(isUnknownRecordType(t)).toBe(true);
  });

  it.each(['TYPE0', 'TYPE65536', 'TYPE', 'TYPE12X', 'type65534', 'A', ''])('rejects %p', (t) => {
    expect(isUnknownRecordType(t)).toBe(false);
  });

  it('looksLikeUnknownRecordType matches out-of-range TYPE tokens too', () => {
    expect(looksLikeUnknownRecordType('TYPE65536')).toBe(true);
    expect(looksLikeUnknownRecordType('A')).toBe(false);
  });
});

describe('validateRfc3597Rdata', () => {
  it.each(['\\# 4 0A000001', '\\# 0', '\\# 4 0a00 0001'])('accepts %s', (v) => {
    expect(validateRfc3597Rdata(v)).toEqual([]);
  });

  it.each([
    '4 0A000001', // missing \# marker
    '\\# 4 0A00', // length mismatch
    '\\# 2 0A0', // odd hex digit count
    '\\# 4 XYZW9999', // bad hex
    '\\# x 00', // non-numeric length
    '\\# 4 0A000001\nsend', // injected directive is not hex
  ])('rejects %p', (v) => {
    expect(validateRfc3597Rdata(v).length).toBeGreaterThan(0);
  });
});

describe('DNSValidationService unknown-type branch', () => {
  const base = { name: 'x.example.com', ttl: 300 };

  it('accepts a well-formed unknown-type record', () => {
    const result = DNSValidationService.validateRecord({ ...base, type: 'TYPE65534', value: '\\# 4 0A000001' }, 'example.com');
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a malformed generic value', () => {
    const result = DNSValidationService.validateRecord({ ...base, type: 'TYPE65534', value: 'not-generic' }, 'example.com');
    expect(result.isValid).toBe(false);
  });

  it('rejects an out-of-range TYPE number', () => {
    const result = DNSValidationService.validateRecord({ ...base, type: 'TYPE65536', value: '\\# 0' }, 'example.com');
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/between 1 and 65535/);
  });

  it('still reports name/TTL problems for unknown-type records', () => {
    const result = DNSValidationService.validateRecord(
      { name: '', ttl: -1, type: 'TYPE65534', value: '\\# 0' },
      'example.com'
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/name/i);
    expect(result.errors.join(' ')).toMatch(/TTL/);
  });

  it('does not affect named-type validation (A record still validated as IPv4)', () => {
    const bad = DNSValidationService.validateRecord({ ...base, type: 'A', value: '\\# 4 0A000001' }, 'example.com');
    expect(bad.isValid).toBe(false);
  });
});

describe('getValueFieldHint', () => {
  it('returns the RFC 3597 hint for TYPE#### types', () => {
    expect(getValueFieldHint('TYPE65534')).toBe(RFC3597_VALUE_HINT);
  });

  it('returns the named-type hint for known types', () => {
    expect(getValueFieldHint('TLSA')).toBe(VALUE_FIELD_HINTS.TLSA);
  });

  it('returns undefined for multi-field types with dedicated editors', () => {
    expect(getValueFieldHint('SOA')).toBeUndefined();
  });
});
