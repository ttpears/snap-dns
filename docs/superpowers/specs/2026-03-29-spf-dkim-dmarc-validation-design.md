# SPF/DKIM/DMARC Validation & Guided Editors

**Date:** 2026-03-29
**Status:** Approved

## Overview

Add tiered validation (errors block, warnings advise) and auto-detecting guided editors for SPF, DKIM, and DMARC records. These are TXT records with well-defined syntaxes that benefit from structured editing and syntax checking. MX handling is already solid and unchanged by this work.

## Architecture: Approach B — Separate Validators + Dedicated Editors

Each subtype gets its own validation module and its own guided editor component. A registry pattern connects detection to the correct validator and editor. This keeps each subtype self-contained, testable, and avoids fighting a shared abstraction across meaningfully different structures (SPF = ordered mechanism list, DKIM/DMARC = semicolon-separated key-value tags).

## Detection & Routing

A `detectTxtSubtype(value: string, recordName?: string)` utility returns `'spf' | 'dkim' | 'dmarc' | null`.

Detection rules:
- **SPF**: value starts with `v=spf1` (case-insensitive)
- **DKIM**: value contains `v=DKIM1` (case-insensitive), or record name matches `*._domainkey*`
- **DMARC**: value starts with `v=DMARC1` (case-insensitive), or record name is `_dmarc`

In `AddDNSRecord` and `RecordEditor`, when TXT is selected, detection runs on every value change. When a subtype is detected, the guided editor renders below the raw textarea (which stays visible but becomes secondary). The user can always collapse the guided editor and edit raw text directly.

Bidirectional sync: editing in the guided editor updates the raw value; editing the raw value re-parses into the guided editor fields.

## Validation

### Shared Types

```typescript
interface ValidationResult {
  errors: string[];    // Block submission
  warnings: string[];  // Show but allow submission
}
```

### SPF Validation (`spfValidator.ts`)

**Errors (block submission):**
- Must start with `v=spf1`
- Unknown mechanisms (not `ip4`, `ip6`, `a`, `mx`, `include`, `all`)
- Invalid IP address or CIDR prefix length in `ip4:`/`ip6:`
- Duplicate mechanisms

**Warnings (allow submission):**
- `+all` — allows anyone to spoof this domain
- More than 10 DNS-lookup mechanisms (`include`, `a`, `mx` each count)
- `ptr` mechanism — deprecated per RFC 7208

### DKIM Validation (`dkimValidator.ts`)

**Errors (block submission):**
- Must contain `v=DKIM1`
- Must have `p=` tag
- `p=` value must be valid base64 (catches paste errors like trailing whitespace or truncation)
- Malformed tag-value syntax (expected `;`-separated `key=value` pairs)

**Warnings (allow submission):**
- Empty `p=` value — flagged as "this is a key revocation record"

### DMARC Validation (`dmarcValidator.ts`)

**Errors (block submission):**
- Must start with `v=DMARC1`
- Must have `p=` tag with valid policy (`none`, `quarantine`, `reject`)
- Malformed tag syntax

**Warnings (allow submission):**
- `p=none` without `rua=` — no reporting configured
- `pct=` less than 100

### Integration

The existing `dnsValidationService.ts` (frontend) calls `detectTxtSubtype()` when record type is TXT. If a subtype is detected, it delegates to the appropriate validator. Errors block submission; warnings display inline but don't block.

## Guided Editor Components

### `SpfEditor.tsx`

Renders SPF as an ordered list of mechanisms, each with:
- Qualifier dropdown (`+`, `-`, `~`, `?`, defaults to `+`)
- Mechanism type dropdown (`ip4`, `ip6`, `a`, `mx`, `include`, `all`)
- Value field (IP/CIDR for `ip4`/`ip6`, domain for `include`/`a`/`mx`, none for `all`)
- Add/remove/reorder buttons

Parses existing `v=spf1 ...` string into mechanism list on mount. Serializes back to string on change. Shows a live DNS lookup counter (counts `include`, `a`, `mx` mechanisms toward the 10-lookup limit).

### `DkimEditor.tsx`

Structured key-value tag form:
- `v` — fixed `DKIM1` (read-only)
- `k` — algorithm dropdown (`rsa`, `ed25519`, defaults to `rsa`)
- `p` — large textarea for pasting the public key (auto-strips whitespace and PEM headers)
- `t` — optional flags checkboxes (`y` for testing, `s` for strict)
- `s` — optional service type (defaults to `*`)

Parses existing DKIM string into tags on mount. Serializes back as semicolon-separated `tag=value` pairs.

### `DmarcEditor.tsx`

Structured tag form:
- `v` — fixed `DMARC1` (read-only)
- `p` — policy dropdown (`none`, `quarantine`, `reject`)
- `sp` — subdomain policy dropdown (same options, optional)
- `rua` — reporting URI text field (mailto: address)
- `ruf` — forensic reporting URI (optional)
- `pct` — percentage slider/number (1-100, defaults to 100)
- `adkim`/`aspf` — alignment dropdowns (`r` relaxed, `s` strict)

Same parse/serialize pattern as the others.

### Integration in UI

Both `AddDNSRecord` and `RecordEditor` render these conditionally based on `detectTxtSubtype()`. The raw textarea remains visible above the guided editor. A small label (e.g., "SPF Editor") appears between them so the user understands the context switch.

## Backend Validation

Backend validators in `backend/src/services/validators/` mirror the frontend validators. The validation logic is identical — pure functions with no DOM dependencies. Kept as separate copies per the existing project pattern of duplicated types between frontend and backend.

**Hook point:** `backend/src/routes/zoneRoutes.ts` already calls `validationService` for add/update operations. The validation service detects TXT subtypes and delegates to the appropriate validator. Errors return 400; warnings are included in the success response:

```typescript
{
  success: true,
  warnings: ["SPF record uses +all which allows any sender to spoof this domain"]
}
```

The frontend surfaces backend warnings in a snackbar after successful submission.

## Testing

### Unit Tests

Frontend (`src/services/validators/__tests__/`):
- `spfValidator.test.ts`
- `dkimValidator.test.ts`
- `dmarcValidator.test.ts`

Backend (`backend/src/services/validators/__tests__/`):
- Same structure mirrored

Coverage: valid records, each error condition, each warning condition, edge cases (empty strings, partial input, mixed case).

### E2E Tests (Playwright)

`tests/e2e/txt-subtype-editors.spec.ts`:
- Add a TXT record, type `v=spf1`, verify SPF editor appears
- Use SPF editor to build a record with `ip4` + `include` + `~all`, verify raw value updates
- Add a DKIM record via guided editor, verify `p=` base64 validation
- Add a DMARC record via guided editor, verify policy is required
- Edit an existing SPF record in ZoneEditor, verify guided editor activates

`tests/e2e/txt-validation.spec.ts`:
- Submit SPF with `+all`, verify warning appears but submission succeeds
- Submit SPF with unknown mechanism, verify error blocks submission
- Submit DKIM with invalid base64 in `p=`, verify error blocks submission

### Test Zone Updates

Add representative records to `test/bind9/zones/test.local.zone` if needed for E2E editing tests.

## File Inventory

### New Files

```
src/services/validators/spfValidator.ts
src/services/validators/dkimValidator.ts
src/services/validators/dmarcValidator.ts
src/services/validators/detectTxtSubtype.ts
src/services/validators/types.ts
src/components/editors/SpfEditor.tsx
src/components/editors/DkimEditor.tsx
src/components/editors/DmarcEditor.tsx
backend/src/services/validators/spfValidator.ts
backend/src/services/validators/dkimValidator.ts
backend/src/services/validators/dmarcValidator.ts
backend/src/services/validators/detectTxtSubtype.ts
backend/src/services/validators/types.ts
tests/e2e/txt-subtype-editors.spec.ts
tests/e2e/txt-validation.spec.ts
```

### Modified Files

```
src/services/dnsValidationService.ts          # Delegate TXT validation to subtype validators
src/components/AddDNSRecord.tsx               # Integrate detection + guided editors
src/components/ZoneEditor.tsx                 # Integrate detection + guided editors in edit mode
backend/src/services/validationService.ts     # Delegate TXT validation to subtype validators
backend/src/routes/zoneRoutes.ts              # Surface warnings in response
```

No changes to types, DNS service, or Docker config.
