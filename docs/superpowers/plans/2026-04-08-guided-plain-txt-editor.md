# Guided Plain TXT Record Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw TXT textarea with a guided editor that strips quotes/escapes, auto-chunks values into ≤255-byte segments, shows a wire-format preview, and auto-heals existing malformed records.

**Architecture:** Add a `txtRecordUtils.ts` pure-function module (duplicated frontend/backend per existing project pattern) and a `PlainTxtEditor` component that activates whenever `detectTxtSubtype()` returns `null`. Backend `validationService.ts` is restructured to validate both string and array TXT values and to reject quote/escape artifacts in plain TXT segments.

**Tech Stack:** React 18 + TypeScript, Material-UI, Jest (frontend tests via CRA), Express + TypeScript (backend).

**Spec:** `docs/superpowers/specs/2026-04-08-guided-plain-txt-editor-design.md`

---

## File Structure

**Created:**
- `src/services/validators/txtRecordUtils.ts` — pure utilities: `cleanTxtValue`, `chunkTxtValue`, `serializeTxtForPreview`, `isTxtValueDirty`
- `src/services/validators/__tests__/txtRecordUtils.test.ts` — unit tests for the utilities
- `src/components/editors/PlainTxtEditor.tsx` — guided editor component
- `backend/src/services/validators/txtRecordUtils.ts` — identical mirror of the frontend utility (project pattern: validators are duplicated)

**Modified:**
- `src/components/AddDNSRecord.tsx` — render `PlainTxtEditor` when `txtSubtype` is null; remove the existing raw TextField for plain TXT
- `src/components/RecordEditor.tsx` — same change in `renderTXTFields()`
- `backend/src/services/validationService.ts` — restructure `case 'TXT':` to validate arrays + reject quote/escape artifacts in plain TXT

**Untouched (intentionally):**
- `src/services/dnsService.ts` `formatValue` — leave the existing quote-escape logic as defense-in-depth; nothing should reach it that needs escaping after this change
- `backend/src/services/dnsService.ts` `normalizeRecord` — multi-string TXT joining behavior is out of scope (the editor's `cleanTxtValue` handles arrays directly)
- The three existing subtype editors (`SpfEditor`, `DkimEditor`, `DmarcEditor`) — unchanged

---

## Task 1: Create `txtRecordUtils.ts` with failing tests

**Files:**
- Create: `src/services/validators/txtRecordUtils.ts`
- Create: `src/services/validators/__tests__/txtRecordUtils.test.ts`

This task establishes the pure-function utility module via TDD. Each function has its own subtask.

### Step 1.1: Write test file with all utility tests

- [ ] **Step 1.1: Write the failing test file**

Create `src/services/validators/__tests__/txtRecordUtils.test.ts`:

```typescript
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
    // This is the bug we found via dig: \"this is a long string that should be one1
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
    // 254 ASCII chars + 1 three-byte char (€ = 0xE2 0x82 0xAC) = 257 bytes total
    // First chunk should be 254 bytes ASCII (no room for the 3-byte char)
    // Second chunk should contain the €
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
```

- [ ] **Step 1.2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=txtRecordUtils --watchAll=false`
Expected: FAIL with "Cannot find module '../txtRecordUtils'"

- [ ] **Step 1.3: Implement `txtRecordUtils.ts`**

Create `src/services/validators/txtRecordUtils.ts`:

```typescript
// src/services/validators/txtRecordUtils.ts
// Pure utilities for handling plain TXT record values: cleaning user/wire-format
// input, chunking values into ≤255-byte segments, and producing wire-format previews.

const MAX_SEGMENT_BYTES = 255;

/**
 * Clean a TXT value loaded from the backend or typed by a user.
 * - Joins multi-string arrays (RFC behavior: TXT strings concatenate at the wire level).
 * - Unescapes \" sequences, then strips all remaining quotes and backslashes.
 * - Strips newlines and carriage returns (TXT records cannot contain them).
 *
 * Returns a single logical text string suitable for editing in a textarea.
 */
export function cleanTxtValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.map(cleanSegment).join('');
  }
  return cleanSegment(value);
}

function cleanSegment(segment: string): string {
  if (typeof segment !== 'string') return '';
  return segment
    .replace(/\\"/g, '"')   // unescape \" → "
    .replace(/["\\]/g, '')  // strip all quotes and backslashes
    .replace(/[\r\n]/g, ''); // strip newlines
}

/**
 * Split a cleaned text string into ≤255-byte UTF-8 segments.
 * - Returns the original string if it fits in one segment.
 * - Otherwise returns an array of segments.
 * - Never splits a multi-byte UTF-8 character across segments.
 */
export function chunkTxtValue(cleaned: string): string | string[] {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(cleaned);

  if (bytes.length <= MAX_SEGMENT_BYTES) {
    return cleaned;
  }

  const chunks: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    let end = Math.min(offset + MAX_SEGMENT_BYTES, bytes.length);

    // Walk back if we landed inside a multi-byte sequence.
    // UTF-8 continuation bytes have the high bits 10xxxxxx (0x80-0xBF).
    while (end > offset && end < bytes.length && (bytes[end] & 0xC0) === 0x80) {
      end--;
    }

    chunks.push(decoder.decode(bytes.slice(offset, end)));
    offset = end;
  }

  return chunks;
}

/**
 * Build a human-readable wire-format preview of a TXT value.
 * Each segment is wrapped in quotes; multi-segment values are joined by spaces.
 */
export function serializeTxtForPreview(value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '""';
    return value.map(s => `"${s}"`).join(' ');
  }
  return `"${value}"`;
}

/**
 * Returns true if the raw value contains characters that cleanTxtValue would
 * strip or transform. Used to set the "wasHealed" flag on load.
 */
export function isTxtValueDirty(raw: string | string[]): boolean {
  if (Array.isArray(raw)) {
    return raw.some(isTxtValueDirty);
  }
  if (typeof raw !== 'string') return false;
  return /["\\\r\n]/.test(raw);
}
```

- [ ] **Step 1.4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=txtRecordUtils --watchAll=false`
Expected: All tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/services/validators/txtRecordUtils.ts src/services/validators/__tests__/txtRecordUtils.test.ts
git commit -m "feat: add txtRecordUtils for plain TXT record handling"
```

---

## Task 2: Mirror `txtRecordUtils.ts` to backend

The project pattern (per CLAUDE.md issue #5) duplicates validators between frontend and backend. We mirror the file so the backend validation in Task 5 can import it.

**Files:**
- Create: `backend/src/services/validators/txtRecordUtils.ts`

- [ ] **Step 2.1: Copy the utility module to the backend**

Create `backend/src/services/validators/txtRecordUtils.ts` with the **same content** as `src/services/validators/txtRecordUtils.ts` from Task 1, except update the path comment on line 1:

```typescript
// backend/src/services/validators/txtRecordUtils.ts
// Pure utilities for handling plain TXT record values: cleaning user/wire-format
// input, chunking values into ≤255-byte segments, and producing wire-format previews.

const MAX_SEGMENT_BYTES = 255;

export function cleanTxtValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.map(cleanSegment).join('');
  }
  return cleanSegment(value);
}

function cleanSegment(segment: string): string {
  if (typeof segment !== 'string') return '';
  return segment
    .replace(/\\"/g, '"')
    .replace(/["\\]/g, '')
    .replace(/[\r\n]/g, '');
}

export function chunkTxtValue(cleaned: string): string | string[] {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(cleaned);

  if (bytes.length <= MAX_SEGMENT_BYTES) {
    return cleaned;
  }

  const chunks: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    let end = Math.min(offset + MAX_SEGMENT_BYTES, bytes.length);
    while (end > offset && end < bytes.length && (bytes[end] & 0xC0) === 0x80) {
      end--;
    }
    chunks.push(decoder.decode(bytes.slice(offset, end)));
    offset = end;
  }

  return chunks;
}

export function serializeTxtForPreview(value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '""';
    return value.map(s => `"${s}"`).join(' ');
  }
  return `"${value}"`;
}

export function isTxtValueDirty(raw: string | string[]): boolean {
  if (Array.isArray(raw)) {
    return raw.some(isTxtValueDirty);
  }
  if (typeof raw !== 'string') return false;
  return /["\\\r\n]/.test(raw);
}
```

- [ ] **Step 2.2: Verify backend type-checks**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2.3: Commit**

```bash
git add backend/src/services/validators/txtRecordUtils.ts
git commit -m "feat: mirror txtRecordUtils to backend"
```

---

## Task 3: Harden backend validation for plain TXT

**Files:**
- Modify: `backend/src/services/validationService.ts:91-105`

This restructures the `case 'TXT':` branch to validate both string and array values, and to reject quote/escape artifacts in plain TXT segments. It also fixes a latent bug where SPF/DKIM/DMARC validation was skipped for array-valued records.

- [ ] **Step 3.1: Locate and read the existing TXT case**

Run: `grep -n "case 'TXT'" backend/src/services/validationService.ts`
Expected: Match around line 91.

Read lines 85-110 to confirm the existing structure matches the spec.

- [ ] **Step 3.2: Replace the TXT case**

Replace the existing block:

```typescript
      case 'TXT':
        if (typeof record.value !== 'string' && !Array.isArray(record.value)) {
          errors.push('Invalid TXT record format');
        } else if (typeof record.value === 'string') {
          const subtype = detectTxtSubtype(record.value, record.name);
          if (subtype) {
            const validator = subtype === 'spf' ? validateSpf
              : subtype === 'dkim' ? validateDkim
              : validateDmarc;
            const result = validator(record.value);
            errors.push(...result.errors);
            warnings.push(...result.warnings);
          }
        }
        break;
```

With:

```typescript
      case 'TXT': {
        if (typeof record.value !== 'string' && !Array.isArray(record.value)) {
          errors.push('Invalid TXT record format');
          break;
        }

        const segments: string[] = Array.isArray(record.value)
          ? (record.value as string[])
          : [record.value as string];
        const joined = segments.join('');
        const subtype = detectTxtSubtype(joined, record.name);

        if (subtype) {
          const validator = subtype === 'spf' ? validateSpf
            : subtype === 'dkim' ? validateDkim
            : validateDmarc;
          const result = validator(joined);
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        } else {
          // Plain TXT — reject quote/escape artifacts and oversized segments
          for (const seg of segments) {
            if (typeof seg !== 'string') {
              errors.push('TXT record segments must be strings');
              continue;
            }
            if (Buffer.byteLength(seg, 'utf8') > 255) {
              errors.push(
                `TXT record segment exceeds 255 bytes (${Buffer.byteLength(seg, 'utf8')} bytes)`
              );
            }
            if (/["\\]/.test(seg)) {
              errors.push('TXT record segments must not contain quotes or backslashes');
            }
            // eslint-disable-next-line no-control-regex
            if (/[\x00-\x1F\x7F]/.test(seg)) {
              errors.push('TXT record segments must not contain control characters');
            }
          }
        }
        break;
      }
```

- [ ] **Step 3.3: Type-check the backend**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3.4: Manually verify the case structure**

Read `backend/src/services/validationService.ts` around the TXT case and confirm the new block compiles cleanly and the surrounding cases are unaffected.

- [ ] **Step 3.5: Commit**

```bash
git add backend/src/services/validationService.ts
git commit -m "feat: harden backend validation for plain TXT records

Reject quote/escape artifacts, oversized segments, and control
characters in plain TXT values. Also fixes subtype validation
being skipped for array-valued TXT records."
```

---

## Task 4: Build the `PlainTxtEditor` component

**Files:**
- Create: `src/components/editors/PlainTxtEditor.tsx`

The component is a controlled input that owns its own internal "cleaned" string state and a `wasHealed` flag. It calls `onChange` with the chunked value (string or string[]) on every edit.

- [ ] **Step 4.1: Create the component**

Create `src/components/editors/PlainTxtEditor.tsx`:

```typescript
// src/components/editors/PlainTxtEditor.tsx
import React, { useEffect, useState } from 'react';
import { Alert, Box, TextField, Typography } from '@mui/material';
import {
  cleanTxtValue,
  chunkTxtValue,
  serializeTxtForPreview,
  isTxtValueDirty,
} from '../../services/validators/txtRecordUtils';

interface PlainTxtEditorProps {
  value: string | string[];
  onChange: (value: string | string[]) => void;
}

function PlainTxtEditor({ value, onChange }: PlainTxtEditorProps) {
  // Internal cleaned text the user actually edits.
  const [text, setText] = useState<string>(() => cleanTxtValue(value));
  // Whether the loaded value differed from the cleaned form.
  const [wasHealed, setWasHealed] = useState<boolean>(() => isTxtValueDirty(value));
  const [healedDismissed, setHealedDismissed] = useState<boolean>(false);

  // Re-sync if the parent passes in a different value (e.g., loading a different record).
  useEffect(() => {
    const cleaned = cleanTxtValue(value);
    setText(cleaned);
    setWasHealed(isTxtValueDirty(value));
    setHealedDismissed(false);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Strip quotes, backslashes, and newlines as the user types.
    const cleaned = e.target.value
      .replace(/\\"/g, '"')
      .replace(/["\\]/g, '')
      .replace(/[\r\n]/g, '');
    setText(cleaned);
    onChange(chunkTxtValue(cleaned));
  };

  const chunked = chunkTxtValue(text);
  const segments = Array.isArray(chunked) ? chunked : [chunked];
  const charCount = text.length;
  const chunkCount = segments.length;
  const preview = serializeTxtForPreview(chunked);

  return (
    <Box>
      {wasHealed && !healedDismissed && (
        <Alert
          severity="info"
          onClose={() => setHealedDismissed(true)}
          sx={{ mb: 2 }}
        >
          This record had extra quoting that was cleaned up. Saving will rewrite it cleanly.
        </Alert>
      )}

      <TextField
        fullWidth
        label="Text content"
        value={text}
        onChange={handleChange}
        multiline
        rows={4}
        helperText="Enter the literal text. Quotes are added automatically."
        inputProps={{ 'data-testid': 'plain-txt-input' }}
      />

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1 }}
        data-testid="plain-txt-counter"
      >
        {charCount} character{charCount === 1 ? '' : 's'} · {chunkCount} chunk
        {chunkCount === 1 ? '' : 's'}
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        DNS wire format preview:
      </Typography>
      <Box
        component="pre"
        data-testid="plain-txt-preview"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          backgroundColor: 'action.hover',
          p: 1,
          borderRadius: 1,
          mt: 0.5,
          mb: 0,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {preview}
      </Box>
    </Box>
  );
}

export default PlainTxtEditor;
```

- [ ] **Step 4.2: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/editors/PlainTxtEditor.tsx
git commit -m "feat: add PlainTxtEditor with guided input and wire-format preview"
```

---

## Task 5: Wire `PlainTxtEditor` into `AddDNSRecord.tsx`

**Files:**
- Modify: `src/components/AddDNSRecord.tsx`

The current code conditionally renders `SpfEditor`/`DkimEditor`/`DmarcEditor` only when `txtSubtype` is set. We need to:
1. Render `PlainTxtEditor` whenever `record.type === 'TXT'` and `txtSubtype` is `null`.
2. Remove the existing raw multiline TextField for plain TXT (the one rendered by the generic `RECORD_TYPES.TXT.fields` block at lines ~91-99).

- [ ] **Step 5.1: Read the relevant sections**

Read `src/components/AddDNSRecord.tsx` lines 91-99 (the TXT field config), 311-360 (handleFieldChange and txt subtype detection), and 580-665 (the field rendering loop and conditional editors).

- [ ] **Step 5.2: Import `PlainTxtEditor`**

Find the existing imports for SpfEditor/DkimEditor/DmarcEditor (search for `SpfEditor`). Add PlainTxtEditor alongside them:

```typescript
import PlainTxtEditor from './editors/PlainTxtEditor';
```

- [ ] **Step 5.3: Suppress the generic TXT TextField when type is TXT**

Locate the field rendering loop (around lines 580-630) that maps over `RECORD_TYPES[record.type].fields` and renders TextFields. We need to skip rendering the `value` field for TXT records (since `PlainTxtEditor` handles it).

The exact change depends on the loop structure. Find the line that looks like:

```typescript
{RECORD_TYPES[record.type].fields.map((field) => (
  <Grid item xs={12} key={field.name}>
    <TextField ... />
  </Grid>
))}
```

Wrap each rendered field in a guard so the TXT `value` field is not rendered (PlainTxtEditor renders it instead):

```typescript
{RECORD_TYPES[record.type].fields.map((field) => {
  if (record.type === 'TXT' && field.name === 'value') {
    return null;
  }
  return (
    <Grid item xs={12} key={field.name}>
      <TextField ... />
    </Grid>
  );
})}
```

(If the existing loop structure is different from this snippet, adapt the guard but preserve the same intent: skip the `value` field for TXT.)

- [ ] **Step 5.4: Update the conditional editor block to include PlainTxtEditor**

Find the conditional editor block at approximately lines 633-654:

```typescript
{record.type === 'TXT' && txtSubtype && (
  <Grid item xs={12}>
    {txtSubtype === 'spf' && (
      <SpfEditor ... />
    )}
    ...
  </Grid>
)}
```

Replace with:

```typescript
{record.type === 'TXT' && (
  <Grid item xs={12}>
    {txtSubtype === 'spf' && (
      <SpfEditor
        value={record.value as string}
        onChange={(val) => handleFieldChange('value', val)}
      />
    )}
    {txtSubtype === 'dkim' && (
      <DkimEditor
        value={record.value as string}
        onChange={(val) => handleFieldChange('value', val)}
      />
    )}
    {txtSubtype === 'dmarc' && (
      <DmarcEditor
        value={record.value as string}
        onChange={(val) => handleFieldChange('value', val)}
      />
    )}
    {!txtSubtype && (
      <PlainTxtEditor
        value={record.value as string | string[]}
        onChange={(val) => handleFieldChange('value', val)}
      />
    )}
  </Grid>
)}
```

- [ ] **Step 5.5: Verify `handleFieldChange('value', val)` accepts `string | string[]`**

Read `handleFieldChange` (around line 311). The current code likely uses subtype detection on string values. After this change, `val` may be a `string[]` for chunked plain TXT. Find this snippet inside `handleFieldChange`:

```typescript
if (field === 'value' && record.type === 'TXT') {
  setTxtSubtype(detectTxtSubtype(value as string, record.name));
}
```

Replace with a version that handles both string and array values by joining first:

```typescript
if (field === 'value' && record.type === 'TXT') {
  const joined = Array.isArray(value) ? (value as string[]).join('') : (value as string);
  setTxtSubtype(detectTxtSubtype(joined, record.name));
}
```

(The exact existing code may differ; adapt the join logic into wherever `detectTxtSubtype` is called.)

- [ ] **Step 5.6: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: No errors. If there are type errors about `record.value` being string vs string[], add `string | string[]` to the appropriate type definition or cast at the call site.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/AddDNSRecord.tsx
git commit -m "feat: render PlainTxtEditor in AddDNSRecord for plain TXT"
```

---

## Task 6: Wire `PlainTxtEditor` into `RecordEditor.tsx`

**Files:**
- Modify: `src/components/RecordEditor.tsx:266-313`

The same change as Task 5, applied to the edit-record dialog.

- [ ] **Step 6.1: Read `renderTXTFields()`**

Read lines 266-313 of `src/components/RecordEditor.tsx`.

- [ ] **Step 6.2: Import `PlainTxtEditor`**

Find the existing SpfEditor import in the file and add:

```typescript
import PlainTxtEditor from './editors/PlainTxtEditor';
```

- [ ] **Step 6.3: Replace `renderTXTFields()` body**

Replace the existing function body (lines 266-313):

```typescript
  const renderTXTFields = () => {
    if (record.type !== 'TXT') return null;

    const handleTxtChange = (val: string | string[]) => {
      handleChange('value', val);
      const joined = Array.isArray(val) ? val.join('') : val;
      setTxtSubtype(detectTxtSubtype(joined, editedRecord.name));
    };

    return (
      <>
        {txtSubtype === 'spf' && (
          <Grid item xs={12}>
            <SpfEditor
              value={editedRecord.value as string}
              onChange={handleTxtChange}
            />
          </Grid>
        )}
        {txtSubtype === 'dkim' && (
          <Grid item xs={12}>
            <DkimEditor
              value={editedRecord.value as string}
              onChange={handleTxtChange}
            />
          </Grid>
        )}
        {txtSubtype === 'dmarc' && (
          <Grid item xs={12}>
            <DmarcEditor
              value={editedRecord.value as string}
              onChange={handleTxtChange}
            />
          </Grid>
        )}
        {!txtSubtype && (
          <Grid item xs={12}>
            <PlainTxtEditor
              value={editedRecord.value as string | string[]}
              onChange={handleTxtChange}
            />
          </Grid>
        )}
      </>
    );
  };
```

Note that the original raw `<TextField label="Text Value" />` is removed entirely — `PlainTxtEditor` replaces it.

- [ ] **Step 6.4: Verify `handleChange` accepts `string | string[]`**

Read `handleChange` in the same file. If TypeScript complains about the value type, widen the parameter or cast at the call site. The DNSRecord type already supports `value: string | string[]` for TXT records (per `src/types/dns.ts`).

- [ ] **Step 6.5: Type-check the frontend**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6.6: Commit**

```bash
git add src/components/RecordEditor.tsx
git commit -m "feat: render PlainTxtEditor in RecordEditor for plain TXT"
```

---

## Task 7: Component test for `PlainTxtEditor`

**Files:**
- Create: `src/components/editors/__tests__/PlainTxtEditor.test.tsx`

Validates the three key UX behaviors: stripping on input, healing on load, and chunked preview.

- [ ] **Step 7.1: Check whether `@testing-library/react` is available**

Run: `grep -E '"@testing-library/react"' package.json`
Expected: A version line. (CRA includes it by default.)

If it's not present, skip this task and instead add a manual test plan note to the spec. Otherwise continue.

- [ ] **Step 7.2: Write the failing test file**

Create `src/components/editors/__tests__/PlainTxtEditor.test.tsx`:

```typescript
// src/components/editors/__tests__/PlainTxtEditor.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PlainTxtEditor from '../PlainTxtEditor';

describe('PlainTxtEditor', () => {
  it('strips quotes from user input', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="" onChange={onChange} />);

    const input = screen.getByTestId('plain-txt-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello "world"' } });

    expect(input.value).toBe('hello world');
    expect(onChange).toHaveBeenLastCalledWith('hello world');
  });

  it('shows the wire-format preview with quotes', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="hello" onChange={onChange} />);

    expect(screen.getByTestId('plain-txt-preview').textContent).toBe('"hello"');
  });

  it('shows healed notice when loading a malformed record', () => {
    const onChange = jest.fn();
    render(
      <PlainTxtEditor
        value={'\\"this is a long string that should be one1'}
        onChange={onChange}
      />
    );

    expect(
      screen.getByText(/extra quoting that was cleaned up/i)
    ).toBeInTheDocument();
    const input = screen.getByTestId('plain-txt-input') as HTMLTextAreaElement;
    expect(input.value).toBe('this is a long string that should be one1');
  });

  it('does not show healed notice for clean records', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="clean text" onChange={onChange} />);

    expect(
      screen.queryByText(/extra quoting that was cleaned up/i)
    ).not.toBeInTheDocument();
  });

  it('shows multi-chunk count for values exceeding 255 bytes', () => {
    const onChange = jest.fn();
    const long = 'a'.repeat(300);
    render(<PlainTxtEditor value={long} onChange={onChange} />);

    expect(screen.getByTestId('plain-txt-counter').textContent).toMatch(
      /300 characters · 2 chunks/
    );
  });

  it('calls onChange with chunked array for long values', () => {
    const onChange = jest.fn();
    render(<PlainTxtEditor value="" onChange={onChange} />);

    const input = screen.getByTestId('plain-txt-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'a'.repeat(256) } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(Array.isArray(lastCall)).toBe(true);
    expect(lastCall).toEqual(['a'.repeat(255), 'a']);
  });
});
```

- [ ] **Step 7.3: Run the tests**

Run: `npm test -- --testPathPattern=PlainTxtEditor --watchAll=false`
Expected: All tests PASS.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/editors/__tests__/PlainTxtEditor.test.tsx
git commit -m "test: add component tests for PlainTxtEditor"
```

---

## Task 8: Full verification

- [ ] **Step 8.1: Frontend type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8.2: Backend type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8.3: Run all frontend tests**

Run: `npm test -- --watchAll=false`
Expected: All tests PASS, including the new `txtRecordUtils` and `PlainTxtEditor` suites.

- [ ] **Step 8.4: Manual smoke test (if a dev environment is available)**

If `docker-compose -f docker-compose.test.yml` is running or can be started:

1. Open the UI and create a new TXT record with value `hello "world"`. Verify the editor strips the quotes and the preview shows `"hello world"`.
2. Save the record and reload it. Verify it loads cleanly with no `wasHealed` notice.
3. Create a TXT record with value `a` repeated 300 times. Verify the editor shows "300 characters · 2 chunks" and the preview shows two quoted segments.
4. Manually use `dig` against the test DNS server to verify the record is well-formed (no escaped quotes).
5. Edit the malformed `testing-txt.hackyourworld.com` record (or any record with `\"` in its value). Verify the editor shows the healed notice and a clean text value.

If a dev environment is not available, document this in the commit message and rely on the unit/component tests.

- [ ] **Step 8.5: Final commit (if any cleanup needed)**

If any additional cleanup or fixes were needed, commit them now. Otherwise this step is a no-op.

```bash
git status
# If clean, no commit needed.
```
