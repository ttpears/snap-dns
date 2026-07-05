// backend/src/services/__tests__/rfc3597.test.ts
// RFC 3597 unknown-type validation: the shared validator helpers, the
// validationService unknown-type branch, and the zod request schema.
import { isUnknownRecordType, looksLikeUnknownRecordType, validateRfc3597Rdata } from '../validators/rfc3597';
import { validationService } from '../validationService';
import { DNSRecordSchema } from '../../middleware/validation';

describe('isUnknownRecordType', () => {
  it.each(['TYPE1', 'TYPE65534', 'TYPE65535', 'TYPE255'])('accepts %s', (t) => {
    expect(isUnknownRecordType(t)).toBe(true);
  });

  it.each(['TYPE0', 'TYPE65536', 'TYPE99999', 'TYPE', 'TYPE12X', 'type65534', 'A', 'TXT', '', 65534])(
    'rejects %p',
    (t) => {
      expect(isUnknownRecordType(t as unknown)).toBe(false);
    }
  );

  it('looksLikeUnknownRecordType matches out-of-range TYPE tokens too', () => {
    expect(looksLikeUnknownRecordType('TYPE0')).toBe(true);
    expect(looksLikeUnknownRecordType('TYPE65536')).toBe(true);
    expect(looksLikeUnknownRecordType('A')).toBe(false);
  });
});

describe('validateRfc3597Rdata', () => {
  it.each([
    '\\# 4 0A000001',
    '\\# 0',
    '\\# 4 0a00 0001', // grouped + lowercase hex
    '  \\# 2 FFFE  ', // surrounding whitespace
  ])('accepts %s', (v) => {
    expect(validateRfc3597Rdata(v)).toEqual([]);
  });

  it.each([
    ['4 0A000001', /must start with/i], // missing \# marker
    ['\\# x 0A', /decimal octet count/i], // non-numeric length
    ['\\#', /decimal octet count/i], // no length at all
    ['\\# 4 0A00', /declares 4 octet\(s\) but provides 2/], // length mismatch (short)
    ['\\# 1 0A00', /declares 1 octet\(s\) but provides 2/], // length mismatch (long)
    ['\\# 0 0A', /declares 0 octet\(s\) but provides 1/], // data after zero length
    ['\\# 2 0A0', /even number of digits/i], // odd hex digit count
    ['\\# 4 XYZW9999', /hexadecimal/i], // bad hex
    ['\\# 65536 00', /not exceed 65535/i], // length over 16-bit max
    ['\\# 4 0A000001\nsend', /hexadecimal/i], // injected directive is not hex
    ['\\# 4 0A000001 ; drop', /hexadecimal/i], // comment injection is not hex
    [42, /must be a string/i], // non-string value
  ])('rejects %p', (v, msg) => {
    const errors = validateRfc3597Rdata(v as unknown);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(msg as RegExp);
  });
});

describe('validationService unknown-type branch', () => {
  const base = { name: 'x.example.com', ttl: 300 };

  it('accepts a well-formed unknown-type record', () => {
    const result = validationService.validateRecord({ ...base, type: 'TYPE65534', value: '\\# 4 0A000001' }, 'example.com');
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts empty generic rdata (\\# 0)', () => {
    const result = validationService.validateRecord({ ...base, type: 'TYPE65280', value: '\\# 0' }, 'example.com');
    expect(result.isValid).toBe(true);
  });

  it('rejects a length/hex mismatch', () => {
    const result = validationService.validateRecord({ ...base, type: 'TYPE65534', value: '\\# 4 0A' }, 'example.com');
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/octet/);
  });

  it('rejects a value that is not generic \\# form', () => {
    const result = validationService.validateRecord({ ...base, type: 'TYPE65534', value: '10.0.0.1' }, 'example.com');
    expect(result.isValid).toBe(false);
  });

  it('rejects an out-of-range TYPE number', () => {
    const result = validationService.validateRecord({ ...base, type: 'TYPE65536', value: '\\# 0' }, 'example.com');
    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/between 1 and 65535/);
  });

  it('does not affect named-type validation (A record still validated as IPv4)', () => {
    const bad = validationService.validateRecord({ ...base, type: 'A', value: '\\# 4 0A000001' }, 'example.com');
    expect(bad.isValid).toBe(false);
    const good = validationService.validateRecord({ ...base, type: 'A', value: '10.0.0.1' }, 'example.com');
    expect(good.isValid).toBe(true);
  });
});

describe('DNSRecordSchema (zod) unknown-type acceptance', () => {
  const record = (type: string) => ({ name: 'x.example.com', type, value: '\\# 4 0A000001', ttl: 300 });

  it.each(['TYPE1', 'TYPE65534', 'TYPE65535'])('accepts type %s', (t) => {
    expect(DNSRecordSchema.safeParse(record(t)).success).toBe(true);
  });

  it('still accepts registered mnemonics', () => {
    expect(DNSRecordSchema.safeParse({ name: 'x.example.com', type: 'A', value: '10.0.0.1', ttl: 300 }).success).toBe(true);
  });

  it.each(['TYPE0', 'TYPE65536', 'TYPE999999', 'type65534', 'TYPEabc', 'BOGUS'])('rejects type %s', (t) => {
    expect(DNSRecordSchema.safeParse(record(t)).success).toBe(false);
  });
});
