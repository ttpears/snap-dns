// backend/src/services/__tests__/dnsPresentation.test.ts
import { parseTxtRdata, quoteTxtValue } from '../dnsPresentation';

describe('parseTxtRdata', () => {
  it('unquotes a single character-string', () => {
    expect(parseTxtRdata('"v=spf1 include:_spf.example.com ~all"')).toBe(
      'v=spf1 include:_spf.example.com ~all'
    );
  });

  it('concatenates multiple character-strings with no separator (RFC 1035 §3.3.14)', () => {
    // A long DKIM key split across two strings reconstructs to the full key.
    expect(parseTxtRdata('"p=MIGfMA0" "GCSqGSIb3"')).toBe('p=MIGfMA0GCSqGSIb3');
  });

  it('preserves internal whitespace inside a quoted string', () => {
    expect(parseTxtRdata('"two  spaces\there"')).toBe('two  spaces\there');
  });

  it('unescapes \\" and \\\\ escapes', () => {
    expect(parseTxtRdata('"a \\"quote\\" and a back\\\\slash"')).toBe('a "quote" and a back\\slash');
  });

  it('decodes \\DDD decimal escapes', () => {
    // \065 == 'A'
    expect(parseTxtRdata('"x\\065y"')).toBe('xAy');
  });

  it('accepts a bare unquoted token', () => {
    expect(parseTxtRdata('bareword')).toBe('bareword');
  });
});

describe('quoteTxtValue', () => {
  it('wraps a single unquoted string in one quoted character-string', () => {
    expect(quoteTxtValue('v=spf1 -all')).toBe('"v=spf1 -all"');
  });

  it('escapes backslash before double-quote', () => {
    expect(quoteTxtValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('quotes each segment of an array independently', () => {
    expect(quoteTxtValue(['seg one', 'seg two'])).toBe('"seg one" "seg two"');
  });

  it('round-trips with parseTxtRdata', () => {
    const original = 'v=DKIM1; k=rsa; p=MIGf "weird" \\value';
    expect(parseTxtRdata(quoteTxtValue(original))).toBe(original);
  });
});
