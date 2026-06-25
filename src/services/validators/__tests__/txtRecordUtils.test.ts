// src/services/validators/__tests__/txtRecordUtils.test.ts
import {
  cleanTxtValue,
  chunkTxtValue,
  serializeTxtForPreview,
  isTxtValueDirty,
} from '../txtRecordUtils';

describe('cleanTxtValue', () => {
  it('returns plain strings unchanged', () => {
    expect(cleanTxtValue('hello world')).toBe('hello world');
  });

  it('strips surrounding quotes', () => {
    expect(cleanTxtValue('"hello"')).toBe('hello');
  });

  it('unescapes escaped quotes then strips them', () => {
    expect(cleanTxtValue('\\"hello\\"')).toBe('hello');
  });

  it('strips backslashes', () => {
    expect(cleanTxtValue('hello\\world')).toBe('helloworld');
  });

  it('strips newlines and carriage returns', () => {
    expect(cleanTxtValue('foo\nbar\rbaz')).toBe('foobarbaz');
  });

  it('joins array values with no separator (RFC behavior)', () => {
    expect(cleanTxtValue(['foo', 'bar'])).toBe('foobar');
  });

  it('cleans array values element-wise then joins', () => {
    expect(cleanTxtValue(['"foo"', '\\"bar\\"'])).toBe('foobar');
  });

  it('handles the malformed real-world case', () => {
    expect(cleanTxtValue('\\"this is a long string that should be one1')).toBe(
      'this is a long string that should be one1'
    );
  });

  it('handles empty string', () => {
    expect(cleanTxtValue('')).toBe('');
  });

  it('handles empty array', () => {
    expect(cleanTxtValue([])).toBe('');
  });
});

describe('chunkTxtValue', () => {
  it('returns a single string when value fits in one chunk', () => {
    expect(chunkTxtValue('hello')).toBe('hello');
  });

  it('returns a single string at exactly 255 bytes', () => {
    const value = 'a'.repeat(255);
    expect(chunkTxtValue(value)).toBe(value);
  });

  it('returns an array when value exceeds 255 bytes', () => {
    const value = 'a'.repeat(256);
    const result = chunkTxtValue(value);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(['a'.repeat(255), 'a']);
  });

  it('splits a 600-character value into three chunks', () => {
    const value = 'a'.repeat(600);
    const result = chunkTxtValue(value) as string[];
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('a'.repeat(255));
    expect(result[1]).toBe('a'.repeat(255));
    expect(result[2]).toBe('a'.repeat(90));
  });

  it('does not split multi-byte UTF-8 characters across chunk boundaries', () => {
    // 254 ASCII chars + € (3 bytes) = 257 bytes total
    // First chunk: 254 ASCII bytes (no room for the 3-byte char at offset 254)
    // Second chunk: €
    const value = 'a'.repeat(254) + '€';
    const result = chunkTxtValue(value) as string[];
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBe('a'.repeat(254));
    expect(result[1]).toBe('€');
  });

  it('handles empty string', () => {
    expect(chunkTxtValue('')).toBe('');
  });
});

describe('serializeTxtForPreview', () => {
  it('wraps a single string in quotes', () => {
    expect(serializeTxtForPreview('hello')).toBe('"hello"');
  });

  it('wraps each array element in quotes joined by spaces', () => {
    expect(serializeTxtForPreview(['foo', 'bar'])).toBe('"foo" "bar"');
  });

  it('handles empty string', () => {
    expect(serializeTxtForPreview('')).toBe('""');
  });

  it('handles empty array', () => {
    expect(serializeTxtForPreview([])).toBe('""');
  });
});

describe('isTxtValueDirty', () => {
  it('returns false for clean strings', () => {
    expect(isTxtValueDirty('hello world')).toBe(false);
  });

  it('returns true for strings with quotes', () => {
    expect(isTxtValueDirty('"hello"')).toBe(true);
  });

  it('returns true for strings with backslashes', () => {
    expect(isTxtValueDirty('hello\\world')).toBe(true);
  });

  it('returns true for strings with newlines', () => {
    expect(isTxtValueDirty('foo\nbar')).toBe(true);
  });

  it('returns false for clean array values', () => {
    expect(isTxtValueDirty(['foo', 'bar'])).toBe(false);
  });

  it('returns true if any array element is dirty', () => {
    expect(isTxtValueDirty(['foo', '"bar"'])).toBe(true);
  });

  it('returns true for the malformed real-world case', () => {
    expect(isTxtValueDirty('\\"this is a long string that should be one1')).toBe(true);
  });
});
