# Guided Plain TXT Record Editor

## Problem

Plain TXT records are entered through a raw multiline textarea. The frontend formatter (`src/services/dnsService.ts:76-83`) wraps the user's value in quotes and escapes any internal quotes. When a user types a value containing quotes, the literal escape sequences end up stored in DNS, producing malformed records like:

```
testing-txt.hackyourworld.com. IN TXT "\"this is a long string that should be one1"
```

The application has rich guided editors for SPF, DKIM, and DMARC TXT subtypes, but plain TXT — the most common case — has no guidance, no preview, and no protection against quote-related corruption.

## Goals

- Eliminate quote-corruption bugs in plain TXT records.
- Give users a clear preview of the actual DNS wire format their input will produce.
- Auto-heal existing malformed records when they are loaded for editing.
- Harden the backend against the same class of bug from direct API clients.
- Match the existing UX pattern established by `SpfEditor`/`DkimEditor`/`DmarcEditor`.

## Non-Goals

- Changing how SPF/DKIM/DMARC records are edited.
- Allowing literal quote characters in plain TXT records. (If a user genuinely needs structured data, the SPF/DKIM/DMARC editors handle the established subtypes; arbitrary quoted content in plain TXT is not a supported use case.)
- Refactoring the broader DNS validation pipeline.

## Architecture

Add one new component and one new utility module:

- **`src/components/editors/PlainTxtEditor.tsx`** — mirrors the existing `SpfEditor`/`DkimEditor`/`DmarcEditor` pattern. Activates whenever `detectTxtSubtype()` returns `null`.
- **`src/services/validators/txtRecordUtils.ts`** — pure functions for cleaning, chunking, and serializing plain TXT values. Mirrored to `backend/src/services/validators/txtRecordUtils.ts` (matching the existing pattern of duplicated validators).

Existing files updated:

- **`src/components/AddDNSRecord.tsx`** — render `PlainTxtEditor` in the conditional editor block (lines ~633-654) when no subtype is detected.
- **`src/components/RecordEditor.tsx`** — same change in the editor's TXT section (lines ~287-310).
- **`backend/src/services/validationService.ts`** — add hardened validation for plain TXT values.
- **`src/services/dnsService.ts`** — leave the existing `formatValue` quote-escape logic in place as a safety net; the editor will ensure nothing reaches it that needs escaping.

## The PlainTxtEditor Component

### Layout

```
┌────────────────────────────────────────────┐
│ Text content                               │
│ ┌────────────────────────────────────────┐ │
│ │ multiline textarea, autosizes          │ │
│ │                                        │ │
│ └────────────────────────────────────────┘ │
│ Enter the literal text. Quotes are added   │
│ automatically.                             │
│                                            │
│ 73 characters · 1 chunk                    │
│                                            │
│ DNS wire format preview:                   │
│ ┌────────────────────────────────────────┐ │
│ │ "hello world"                          │ │
│ └────────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

When the value is long enough to require chunking:

```
412 characters · 2 chunks

DNS wire format preview:
"first 255 characters of the value go here..." "remaining 157 characters here..."
```

When a malformed record is loaded and auto-healed:

```
ⓘ This record had extra quoting that was cleaned up.
  Saving will rewrite it cleanly. [Dismiss]
```

### Behavior

**On input (user typing/pasting):**
- Strip `"`, `\`, and `\n` / `\r` from the input as the user types.
- Update the preview and chunk count live.
- Never show an error for stripped characters; the cleaning is silent and obvious from the preview.

**On load (existing record):**
- Run the value through `cleanTxtValue()`:
  - If value is an array, join with empty string (multi-string TXT records concatenate at the wire level, not separated by spaces — this is the difference from how the current backend `normalizeRecord` joins with `' '`, which is itself slightly wrong but tolerated).
  - Unescape `\"` → `"`, then strip all remaining `"` and `\` characters.
- If the cleaned value differs from the original raw value, set a `wasHealed` flag and show the dismissible "auto-cleaned" notice.

**On save:**
- Run `chunkTxtValue(cleaned)` to split into ≤255-byte UTF-8 segments.
- Pass the resulting `string[]` (or single string if one chunk) to the parent form's `value` field.
- The existing `getRecordForSubmission` and frontend `dnsService.formatValue` already handle arrays correctly.

### Props

```typescript
interface PlainTxtEditorProps {
  value: string | string[];
  onChange: (value: string | string[]) => void;
}
```

The editor manages its own internal cleaned-text state and `wasHealed` flag. It calls `onChange` with the chunked array (or single string) on every edit.

## txtRecordUtils.ts API

```typescript
/**
 * Clean a TXT value loaded from the backend.
 * Joins multi-string arrays, unescapes quote sequences, strips quotes/backslashes/newlines.
 * Returns a single logical text string suitable for editing.
 */
export function cleanTxtValue(value: string | string[]): string;

/**
 * Split a cleaned text string into ≤255-byte UTF-8 chunks.
 * Returns a single string if it fits in one chunk, otherwise an array.
 */
export function chunkTxtValue(cleaned: string): string | string[];

/**
 * Build a human-readable wire-format preview from a chunked value.
 * Example: ["foo", "bar"] → '"foo" "bar"'
 */
export function serializeTxtForPreview(value: string | string[]): string;

/**
 * Returns true if the raw value contains quote/escape artifacts that
 * cleanTxtValue would strip. Used to set the "wasHealed" flag on load.
 */
export function isTxtValueDirty(raw: string | string[]): boolean;
```

**UTF-8 chunking note:** `chunkTxtValue` splits on byte boundaries (not character boundaries) but never in the middle of a multi-byte UTF-8 sequence. Implementation: encode to bytes, slice at the largest valid boundary ≤255, decode, repeat.

## Data Flow Comparison

**Current (broken):**
```
User types:       hello "world"
Frontend wraps:   "hello \"world\""
nsupdate stores:  literal escaped quotes
dig reads back:   "hello \"world\""
```

**New:**
```
User types:       hello "world"
Editor strips:    hello world          (live, in textarea)
Preview shows:    "hello world"
On save:          ["hello world"]      (array of chunks)
Frontend wraps:   "hello world"        (existing formatValue, no escaping needed)
nsupdate stores:  clean record
dig reads back:   "hello world"
```

The key invariant: **by the time a value reaches `dnsService.formatValue`, it contains no quote characters.** The existing escape logic stays as defense-in-depth but is never exercised for plain TXT going forward.

## Backend Validation

Restructure the `case 'TXT':` branch in `backend/src/services/validationService.ts` so that:

1. Subtype detection runs once at the top, against the joined string form of the value (so it works for both string and array cases).
2. If a subtype is detected, run the existing SPF/DKIM/DMARC validators.
3. If no subtype is detected, run the new plain TXT hardening checks against each segment.

```typescript
case 'TXT': {
  if (typeof record.value !== 'string' && !Array.isArray(record.value)) {
    errors.push('Invalid TXT record format');
    break;
  }

  const segments: string[] = Array.isArray(record.value) ? record.value : [record.value];
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
        errors.push(`TXT record segment exceeds 255 bytes (${Buffer.byteLength(seg, 'utf8')} bytes)`);
      }
      if (/["\\]/.test(seg)) {
        errors.push('TXT record segments must not contain quotes or backslashes');
      }
      if (/[\x00-\x1F\x7F]/.test(seg)) {
        errors.push('TXT record segments must not contain control characters');
      }
    }
  }
  break;
}
```

Note: this slightly changes existing subtype validation behavior — it now runs against the joined string form for array-valued records, rather than skipping validation entirely (the current code only validates the string branch). This is an intentional improvement; multi-string SPF/DKIM/DMARC records were previously unvalidated.

This closes the gap noted in CLAUDE.md issue #8 (no backend validation) for the specific case of plain TXT records and prevents direct API clients from reproducing the malformed-record bug.

## Edge Cases

| Case | Behavior |
|---|---|
| Empty value | Allowed; serializes to `""` |
| Value is exactly 255 bytes | One chunk |
| Value is 256 bytes | Two chunks: 255 + 1 |
| Multi-byte UTF-8 char straddles 255-byte boundary | Split at last valid char boundary ≤255 |
| Existing record stored as array `["foo", "bar"]` | Loads as `foobar` (concatenated, per RFC behavior) |
| Existing record stored as `"\"hello\""` | Loads as `hello`, `wasHealed = true` |
| User pastes content with newlines | Newlines stripped silently |
| User attempts to save empty value | Form validation rejects (existing behavior) |
| Record is `_dmarc.example.com` with non-DMARC value | DMARC editor still wins (existing detection by name) |

## Testing

**Unit tests for `txtRecordUtils.ts`:**
- `cleanTxtValue('"hello"')` → `'hello'`
- `cleanTxtValue('\\"hello\\"')` → `'hello'`
- `cleanTxtValue(['foo', 'bar'])` → `'foobar'`
- `cleanTxtValue('foo\nbar')` → `'foobar'`
- `chunkTxtValue('a'.repeat(254))` → string
- `chunkTxtValue('a'.repeat(255))` → string
- `chunkTxtValue('a'.repeat(256))` → array of 2
- `chunkTxtValue('a'.repeat(255) + '€')` → splits before the multi-byte char
- `serializeTxtForPreview(['foo', 'bar'])` → `'"foo" "bar"'`
- `isTxtValueDirty('"hello"')` → `true`
- `isTxtValueDirty('hello')` → `false`

**Component tests for `PlainTxtEditor`:**
- Pasting `hello "world"` results in textarea showing `hello world` and preview showing `"hello world"`.
- Loading a record with value `'\\"this is a long string that should be one1'` shows cleaned text and the `wasHealed` notice.
- Typing 256 characters shows "256 characters · 2 chunks" and a two-chunk preview.

**Backend validation tests:**
- POST a plain TXT record with quotes in the value → 400 with error.
- POST a plain TXT record with a 256-byte segment → 400 with error.
- POST a plain TXT record with a control character → 400 with error.
- POST a clean plain TXT record → 200.

**Integration test:**
- Create a record via the new editor with a long value (>255 chars).
- Verify backend stores it as a multi-string TXT record.
- Reload the record in the editor.
- Verify the editor shows the original text (concatenated) with no `wasHealed` notice.

## Out of Scope

- Migrating existing malformed records in bulk. They get healed on edit, one at a time.
- Adding a new API endpoint for "fix all malformed TXT records." If the user wants this later, it can be a follow-up.
- Changing how the backend `normalizeRecord` joins multi-string TXT records on read (currently joins with space — slightly wrong per RFC, but the editor's `cleanTxtValue` accepts arrays directly so the editor path is unaffected).
