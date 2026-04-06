# SPF/DKIM/DMARC Validation & Guided Editors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tiered validation (errors block, warnings advise) and auto-detecting guided editors for SPF, DKIM, and DMARC TXT records in both frontend and backend.

**Architecture:** Each subtype (SPF, DKIM, DMARC) gets its own validator module and guided editor component. A detection utility routes TXT records to the correct validator/editor. Validators are pure functions duplicated between frontend and backend (following existing project convention). Guided editors render below the raw textarea in both AddDNSRecord and RecordEditor, with bidirectional sync.

**Tech Stack:** React 18, Material-UI 5, TypeScript 5.7, Express, Playwright for E2E tests.

**Spec:** `docs/superpowers/specs/2026-03-29-spf-dkim-dmarc-validation-design.md`

---

## File Structure

### New Files — Shared Types & Detection
- `src/services/validators/types.ts` — `ValidationResult` interface (errors + warnings)
- `src/services/validators/detectTxtSubtype.ts` — detection utility
- `backend/src/services/validators/types.ts` — same interface (backend copy)
- `backend/src/services/validators/detectTxtSubtype.ts` — same detection (backend copy)

### New Files — Validators (Frontend)
- `src/services/validators/spfValidator.ts` — SPF validation logic
- `src/services/validators/dkimValidator.ts` — DKIM validation logic
- `src/services/validators/dmarcValidator.ts` — DMARC validation logic

### New Files — Validators (Backend)
- `backend/src/services/validators/spfValidator.ts` — SPF validation (backend copy)
- `backend/src/services/validators/dkimValidator.ts` — DKIM validation (backend copy)
- `backend/src/services/validators/dmarcValidator.ts` — DMARC validation (backend copy)

### New Files — Guided Editors
- `src/components/editors/SpfEditor.tsx` — SPF mechanism list editor
- `src/components/editors/DkimEditor.tsx` — DKIM tag-value editor
- `src/components/editors/DmarcEditor.tsx` — DMARC tag-value editor

### New Files — Tests
- `src/services/validators/__tests__/spfValidator.test.ts`
- `src/services/validators/__tests__/dkimValidator.test.ts`
- `src/services/validators/__tests__/dmarcValidator.test.ts`
- `src/services/validators/__tests__/detectTxtSubtype.test.ts`
- `tests/e2e/txt-subtype-editors.spec.ts`
- `tests/e2e/txt-validation.spec.ts`

### Modified Files
- `src/services/dnsValidationService.ts` — delegate TXT case to subtype validators
- `src/components/AddDNSRecord.tsx` — integrate detection + render guided editors
- `src/components/RecordEditor.tsx` — integrate detection + render guided editors for edit
- `backend/src/services/validationService.ts` — delegate TXT case to subtype validators
- `backend/src/routes/zoneRoutes.ts` — include warnings in success responses

---

## Task 1: Shared Types & Detection Utility

**Files:**
- Create: `src/services/validators/types.ts`
- Create: `src/services/validators/detectTxtSubtype.ts`
- Create: `src/services/validators/__tests__/detectTxtSubtype.test.ts`

- [ ] **Step 1: Create the ValidationResult type**

```typescript
// src/services/validators/types.ts
export interface TxtValidationResult {
  errors: string[];
  warnings: string[];
}
```

- [ ] **Step 2: Write failing tests for detectTxtSubtype**

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/detectTxtSubtype.test.ts --no-cache 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 4: Implement detectTxtSubtype**

```typescript
// src/services/validators/detectTxtSubtype.ts
export type TxtSubtype = 'spf' | 'dkim' | 'dmarc';

export function detectTxtSubtype(value: string, recordName?: string): TxtSubtype | null {
  const v = value.trimStart().toLowerCase();

  // SPF: value starts with v=spf1
  if (v.startsWith('v=spf1')) {
    return 'spf';
  }

  // DKIM: value contains v=DKIM1, or name contains _domainkey
  if (v.includes('v=dkim1')) {
    return 'dkim';
  }
  if (recordName && recordName.toLowerCase().includes('._domainkey')) {
    return 'dkim';
  }

  // DMARC: value starts with v=DMARC1, or name is _dmarc
  if (v.startsWith('v=dmarc1')) {
    return 'dmarc';
  }
  if (recordName && recordName.toLowerCase() === '_dmarc') {
    return 'dmarc';
  }

  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/detectTxtSubtype.test.ts --no-cache 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/validators/types.ts src/services/validators/detectTxtSubtype.ts src/services/validators/__tests__/detectTxtSubtype.test.ts
git commit -m "feat: add TXT subtype detection utility and ValidationResult type"
```

---

## Task 2: SPF Validator

**Files:**
- Create: `src/services/validators/spfValidator.ts`
- Create: `src/services/validators/__tests__/spfValidator.test.ts`

- [ ] **Step 1: Write failing tests for SPF validator**

```typescript
// src/services/validators/__tests__/spfValidator.test.ts
import { validateSpf } from '../spfValidator';

describe('validateSpf', () => {
  describe('errors (block submission)', () => {
    it('requires v=spf1 prefix', () => {
      const result = validateSpf('ip4:1.2.3.4 ~all');
      expect(result.errors).toContain('SPF record must start with "v=spf1"');
    });

    it('rejects unknown mechanisms', () => {
      const result = validateSpf('v=spf1 bogus:foo ~all');
      expect(result.errors.some(e => e.includes('Unknown mechanism'))).toBe(true);
    });

    it('rejects invalid IPv4 in ip4 mechanism', () => {
      const result = validateSpf('v=spf1 ip4:999.999.999.999 ~all');
      expect(result.errors.some(e => e.includes('Invalid IPv4'))).toBe(true);
    });

    it('rejects invalid CIDR in ip4 mechanism', () => {
      const result = validateSpf('v=spf1 ip4:1.2.3.0/33 ~all');
      expect(result.errors.some(e => e.includes('CIDR'))).toBe(true);
    });

    it('rejects invalid IPv6 in ip6 mechanism', () => {
      const result = validateSpf('v=spf1 ip6:not-an-ipv6 ~all');
      expect(result.errors.some(e => e.includes('Invalid IPv6'))).toBe(true);
    });

    it('rejects invalid CIDR in ip6 mechanism', () => {
      const result = validateSpf('v=spf1 ip6:2001:db8::/129 ~all');
      expect(result.errors.some(e => e.includes('CIDR'))).toBe(true);
    });

    it('rejects duplicate mechanisms', () => {
      const result = validateSpf('v=spf1 ip4:1.2.3.4 ip4:1.2.3.4 ~all');
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
  });

  describe('warnings (allow submission)', () => {
    it('warns on +all', () => {
      const result = validateSpf('v=spf1 mx +all');
      expect(result.warnings.some(w => w.includes('+all'))).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('warns when DNS lookup count exceeds 10', () => {
      const mechanisms = Array.from({ length: 11 }, (_, i) => `include:d${i}.example.com`);
      const result = validateSpf(`v=spf1 ${mechanisms.join(' ')} ~all`);
      expect(result.warnings.some(w => w.includes('10'))).toBe(true);
    });

    it('warns on ptr mechanism', () => {
      const result = validateSpf('v=spf1 ptr ~all');
      expect(result.warnings.some(w => w.includes('ptr') || w.includes('deprecated'))).toBe(true);
    });
  });

  describe('valid records', () => {
    it('accepts a basic SPF record', () => {
      const result = validateSpf('v=spf1 mx a ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts ip4 with CIDR', () => {
      const result = validateSpf('v=spf1 ip4:192.168.1.0/24 -all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts ip6 with CIDR', () => {
      const result = validateSpf('v=spf1 ip6:2001:db8::/32 -all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts include mechanism', () => {
      const result = validateSpf('v=spf1 include:_spf.google.com ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('accepts qualifiers on mechanisms', () => {
      const result = validateSpf('v=spf1 +mx -ip4:1.2.3.4 ?a ~all');
      expect(result.errors).toHaveLength(0);
    });

    it('is case-insensitive on v=spf1', () => {
      const result = validateSpf('V=SPF1 mx ~all');
      expect(result.errors).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/spfValidator.test.ts --no-cache 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SPF validator**

```typescript
// src/services/validators/spfValidator.ts
import { TxtValidationResult } from './types';

const KNOWN_MECHANISMS = ['all', 'ip4', 'ip6', 'a', 'mx', 'include', 'exists', 'ptr'];
const QUALIFIER_RE = /^[+\-~?]?/;
const DNS_LOOKUP_MECHANISMS = ['include', 'a', 'mx', 'ptr', 'exists'];

export function validateSpf(value: string): TxtValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = value.trim();

  // Must start with v=spf1
  if (!/^v=spf1(\s|$)/i.test(trimmed)) {
    errors.push('SPF record must start with "v=spf1"');
    return { errors, warnings };
  }

  // Parse tokens after v=spf1
  const tokens = trimmed.replace(/^v=spf1\s*/i, '').split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  let dnsLookups = 0;

  for (const token of tokens) {
    // Strip qualifier
    const qualifier = token.match(QUALIFIER_RE)?.[0] || '';
    const body = token.slice(qualifier.length);

    // Split mechanism:value
    const colonIdx = body.indexOf(':');
    const mechanism = (colonIdx >= 0 ? body.slice(0, colonIdx) : body).toLowerCase();
    const arg = colonIdx >= 0 ? body.slice(colonIdx + 1) : '';

    if (!KNOWN_MECHANISMS.includes(mechanism)) {
      errors.push(`Unknown mechanism: "${mechanism}"`);
      continue;
    }

    // Duplicate check (qualifier + mechanism + arg)
    const key = `${mechanism}:${arg}`.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Duplicate mechanism: "${token}"`);
      continue;
    }
    seen.add(key);

    // Count DNS lookups
    if (DNS_LOOKUP_MECHANISMS.includes(mechanism)) {
      dnsLookups++;
    }

    // Validate ip4 argument
    if (mechanism === 'ip4' && arg) {
      const [ip, cidr] = arg.split('/');
      if (!isValidIPv4(ip)) {
        errors.push(`Invalid IPv4 address in "${token}"`);
      }
      if (cidr !== undefined) {
        const prefix = parseInt(cidr, 10);
        if (isNaN(prefix) || prefix < 0 || prefix > 32) {
          errors.push(`Invalid CIDR prefix length in "${token}" (must be 0-32)`);
        }
      }
    }

    // Validate ip6 argument
    if (mechanism === 'ip6' && arg) {
      const [ip, cidr] = splitIp6Cidr(arg);
      if (!isValidIPv6Simple(ip)) {
        errors.push(`Invalid IPv6 address in "${token}"`);
      }
      if (cidr !== undefined) {
        const prefix = parseInt(cidr, 10);
        if (isNaN(prefix) || prefix < 0 || prefix > 128) {
          errors.push(`Invalid CIDR prefix length in "${token}" (must be 0-128)`);
        }
      }
    }

    // Warn on +all
    if (mechanism === 'all' && (qualifier === '+' || qualifier === '')) {
      warnings.push('"+all" allows any server to send mail as this domain — this is almost always a mistake');
    }

    // Warn on ptr
    if (mechanism === 'ptr') {
      warnings.push('"ptr" mechanism is deprecated (RFC 7208) and may cause DNS lookup delays');
    }
  }

  if (dnsLookups > 10) {
    warnings.push(`SPF record causes ${dnsLookups} DNS lookups (limit is 10) — receivers may reject this record`);
  }

  return { errors, warnings };
}

function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

function splitIp6Cidr(arg: string): [string, string | undefined] {
  // IPv6 CIDR: find the last / that is followed only by digits
  const match = arg.match(/^(.+)\/(\d+)$/);
  if (match) return [match[1], match[2]];
  return [arg, undefined];
}

function isValidIPv6Simple(ip: string): boolean {
  // Basic IPv6 validation: 1-8 groups of hex separated by colons, with optional :: compression
  if (ip === '::') return true;
  const parts = ip.split('::');
  if (parts.length > 2) return false;

  const validateGroups = (s: string): boolean => {
    if (!s) return true;
    const groups = s.split(':');
    return groups.every(g => /^[0-9a-f]{1,4}$/i.test(g));
  };

  if (parts.length === 2) {
    if (!validateGroups(parts[0]) || !validateGroups(parts[1])) return false;
    const left = parts[0] ? parts[0].split(':').length : 0;
    const right = parts[1] ? parts[1].split(':').length : 0;
    return left + right < 8;
  }

  const groups = ip.split(':');
  return groups.length === 8 && groups.every(g => /^[0-9a-f]{1,4}$/i.test(g));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/spfValidator.test.ts --no-cache 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/validators/spfValidator.ts src/services/validators/__tests__/spfValidator.test.ts
git commit -m "feat: add SPF validator with tiered error/warning support"
```

---

## Task 3: DKIM Validator

**Files:**
- Create: `src/services/validators/dkimValidator.ts`
- Create: `src/services/validators/__tests__/dkimValidator.test.ts`

- [ ] **Step 1: Write failing tests for DKIM validator**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/dkimValidator.test.ts --no-cache 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DKIM validator**

```typescript
// src/services/validators/dkimValidator.ts
import { TxtValidationResult } from './types';

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function validateDkim(value: string): TxtValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = value.trim();

  // Parse semicolon-separated tags
  const tags = parseTags(trimmed, errors);
  if (errors.length > 0 && tags.size === 0) {
    return { errors, warnings };
  }

  // Must contain v=DKIM1
  const version = tags.get('v');
  if (!version || version.toLowerCase() !== 'dkim1') {
    errors.push('DKIM record must contain "v=DKIM1"');
  }

  // Must have p= tag
  if (!tags.has('p')) {
    errors.push('DKIM record must contain a "p=" (public key) tag');
    return { errors, warnings };
  }

  const publicKey = tags.get('p')!;

  // Empty p= is a revocation record — warn but don't error
  if (publicKey === '') {
    warnings.push('Empty "p=" tag indicates a key revocation record — mail signed with this selector will fail verification');
    return { errors, warnings };
  }

  // Validate base64 encoding of public key (strip internal whitespace first)
  const keyClean = publicKey.replace(/\s/g, '');
  if (!BASE64_RE.test(keyClean)) {
    errors.push('Invalid base64 in "p=" tag — check for truncation or extra characters');
  }

  return { errors, warnings };
}

function parseTags(value: string, errors: string[]): Map<string, string> {
  const tags = new Map<string, string>();
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) {
      errors.push(`Malformed DKIM tag: "${part}" (expected "key=value" format)`);
      continue;
    }
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();
    tags.set(key, val);
  }

  return tags;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/dkimValidator.test.ts --no-cache 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/validators/dkimValidator.ts src/services/validators/__tests__/dkimValidator.test.ts
git commit -m "feat: add DKIM validator with base64 key checking"
```

---

## Task 4: DMARC Validator

**Files:**
- Create: `src/services/validators/dmarcValidator.ts`
- Create: `src/services/validators/__tests__/dmarcValidator.test.ts`

- [ ] **Step 1: Write failing tests for DMARC validator**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/dmarcValidator.test.ts --no-cache 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DMARC validator**

```typescript
// src/services/validators/dmarcValidator.ts
import { TxtValidationResult } from './types';

const VALID_POLICIES = ['none', 'quarantine', 'reject'];

export function validateDmarc(value: string): TxtValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = value.trim();

  // Must start with v=DMARC1
  if (!/^v=dmarc1(;|\s|$)/i.test(trimmed)) {
    errors.push('DMARC record must start with "v=DMARC1"');
    return { errors, warnings };
  }

  // Parse semicolon-separated tags
  const tags = parseTags(trimmed, errors);

  // Must have p= tag with valid policy
  if (!tags.has('p')) {
    errors.push('DMARC record must contain a "p=" (policy) tag');
    return { errors, warnings };
  }

  const policy = tags.get('p')!.toLowerCase();
  if (!VALID_POLICIES.includes(policy)) {
    errors.push(`Invalid DMARC policy "${tags.get('p')}" — must be one of: none, quarantine, reject`);
  }

  // Validate sp= if present
  if (tags.has('sp')) {
    const sp = tags.get('sp')!.toLowerCase();
    if (!VALID_POLICIES.includes(sp)) {
      errors.push(`Invalid subdomain policy "${tags.get('sp')}" — must be one of: none, quarantine, reject`);
    }
  }

  // Validate pct= if present
  if (tags.has('pct')) {
    const pct = parseInt(tags.get('pct')!, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      errors.push('DMARC "pct=" must be a number between 0 and 100');
    } else if (pct < 100) {
      warnings.push(`DMARC "pct=${pct}" means only ${pct}% of messages will have the policy applied`);
    }
  }

  // Validate adkim= and aspf= if present
  if (tags.has('adkim')) {
    const v = tags.get('adkim')!.toLowerCase();
    if (v !== 'r' && v !== 's') {
      errors.push('DMARC "adkim=" must be "r" (relaxed) or "s" (strict)');
    }
  }
  if (tags.has('aspf')) {
    const v = tags.get('aspf')!.toLowerCase();
    if (v !== 'r' && v !== 's') {
      errors.push('DMARC "aspf=" must be "r" (relaxed) or "s" (strict)');
    }
  }

  // Warn: p=none without rua means no feedback
  if (policy === 'none' && !tags.has('rua')) {
    warnings.push('Policy is "none" with no "rua=" reporting address — you won\'t receive any DMARC reports');
  }

  return { errors, warnings };
}

function parseTags(value: string, errors: string[]): Map<string, string> {
  const tags = new Map<string, string>();
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) {
      errors.push(`Malformed DMARC tag: "${part}" (expected "key=value" format)`);
      continue;
    }
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();
    tags.set(key, val);
  }

  return tags;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/__tests__/dmarcValidator.test.ts --no-cache 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/validators/dmarcValidator.ts src/services/validators/__tests__/dmarcValidator.test.ts
git commit -m "feat: add DMARC validator with policy and tag checking"
```

---

## Task 5: Integrate Validators into Frontend dnsValidationService

**Files:**
- Modify: `src/services/dnsValidationService.ts` (lines 3-6 for types, lines 48-53 for TXT case)

- [ ] **Step 1: Update the ValidationResult interface and TXT case**

The existing `ValidationResult` at line 3 has `{ isValid, errors }`. We need to add `warnings` and delegate TXT validation to the subtype validators.

Modify `src/services/dnsValidationService.ts`:

1. Add `warnings` to the existing `ValidationResult` interface:
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

2. Add imports at the top:
```typescript
import { detectTxtSubtype } from './validators/detectTxtSubtype';
import { validateSpf } from './validators/spfValidator';
import { validateDkim } from './validators/dkimValidator';
import { validateDmarc } from './validators/dmarcValidator';
```

3. Replace the TXT case (lines 48-53) with:
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

4. Add `warnings` array alongside `errors` at line 10, and include it in the return:
```typescript
    const warnings: string[] = [];
    // ... existing code ...
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
```

- [ ] **Step 2: Verify the frontend type-check passes**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors (or only pre-existing errors unrelated to validation)

Note: Some callers may need updating if they don't expect the `warnings` field. Since `warnings` is a new field on the return type, existing code that destructures only `{ isValid, errors }` will continue to work. Callers that use the result will be updated in later tasks to surface warnings.

- [ ] **Step 3: Commit**

```bash
git add src/services/dnsValidationService.ts
git commit -m "feat: integrate SPF/DKIM/DMARC validators into frontend validation service"
```

---

## Task 6: Backend Validators (Copy + Integrate)

**Files:**
- Create: `backend/src/services/validators/types.ts`
- Create: `backend/src/services/validators/detectTxtSubtype.ts`
- Create: `backend/src/services/validators/spfValidator.ts`
- Create: `backend/src/services/validators/dkimValidator.ts`
- Create: `backend/src/services/validators/dmarcValidator.ts`
- Modify: `backend/src/services/validationService.ts` (lines 6-9 for types, lines 84-88 for TXT case)
- Modify: `backend/src/routes/zoneRoutes.ts` (lines 171-179, ~213 for warnings in response)

- [ ] **Step 1: Copy validator files to backend**

The backend validators are identical pure functions. Copy the following files:

- `src/services/validators/types.ts` → `backend/src/services/validators/types.ts`
- `src/services/validators/detectTxtSubtype.ts` → `backend/src/services/validators/detectTxtSubtype.ts`
- `src/services/validators/spfValidator.ts` → `backend/src/services/validators/spfValidator.ts`
- `src/services/validators/dkimValidator.ts` → `backend/src/services/validators/dkimValidator.ts`
- `src/services/validators/dmarcValidator.ts` → `backend/src/services/validators/dmarcValidator.ts`

Update the comment at the top of each copied file to reflect the backend path (e.g., `// backend/src/services/validators/spfValidator.ts`).

- [ ] **Step 2: Update backend validationService.ts**

Add `warnings` to the backend `ValidationResult` at line 6:
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

Add imports:
```typescript
import { detectTxtSubtype } from './validators/detectTxtSubtype';
import { validateSpf } from './validators/spfValidator';
import { validateDkim } from './validators/dkimValidator';
import { validateDmarc } from './validators/dmarcValidator';
```

Replace the TXT case (lines 84-88):
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

Add `warnings` array in the `validateRecord` method and return it:
```typescript
  validateRecord(record: any, zone: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    // ... existing validation ...
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
```

- [ ] **Step 3: Surface warnings in zoneRoutes responses**

In `backend/src/routes/zoneRoutes.ts`, for each route (add, delete, update), after the existing validation check and before the success response, capture warnings and include them in the response.

For the **add record** route (~line 213), change:
```typescript
    res.json(result);
```
to:
```typescript
    res.json({ ...result, warnings: validation.warnings });
```

Apply the same pattern for the **delete** and **update** routes' success responses.

- [ ] **Step 4: Verify backend compiles**

Run: `cd /home/ttpearso/git/snap-dns/backend && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Run backend unit tests**

The backend validators are identical to frontend. Run the frontend tests to confirm the logic is sound. Backend-specific test files are optional since the pure functions are copied verbatim; if you want backend coverage, copy the frontend test files to `backend/src/services/validators/__tests__/` with adjusted import paths.

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/ --no-cache 2>&1 | tail -20`
Expected: All tests pass (confirms the shared logic is correct)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/validators/ backend/src/services/validationService.ts backend/src/routes/zoneRoutes.ts
git commit -m "feat: add backend TXT subtype validators and surface warnings in API responses"
```

---

## Task 7: SPF Guided Editor Component

**Files:**
- Create: `src/components/editors/SpfEditor.tsx`

- [ ] **Step 1: Implement SPF Editor**

```tsx
// src/components/editors/SpfEditor.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface SpfMechanism {
  qualifier: string;
  type: string;
  value: string;
}

interface SpfEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const MECHANISM_TYPES = ['ip4', 'ip6', 'a', 'mx', 'include', 'all'];
const QUALIFIERS = [
  { value: '+', label: '+ Pass (default)' },
  { value: '-', label: '- Fail' },
  { value: '~', label: '~ SoftFail' },
  { value: '?', label: '? Neutral' },
];

const DNS_LOOKUP_TYPES = ['include', 'a', 'mx'];

function parseSpf(value: string): SpfMechanism[] {
  const trimmed = value.trim();
  if (!/^v=spf1(\s|$)/i.test(trimmed)) return [];

  const tokens = trimmed.replace(/^v=spf1\s*/i, '').split(/\s+/).filter(Boolean);
  return tokens.map(token => {
    const qualifierMatch = token.match(/^([+\-~?])/);
    const qualifier = qualifierMatch ? qualifierMatch[1] : '+';
    const body = qualifierMatch ? token.slice(1) : token;
    const colonIdx = body.indexOf(':');
    const type = (colonIdx >= 0 ? body.slice(0, colonIdx) : body).toLowerCase();
    const mechValue = colonIdx >= 0 ? body.slice(colonIdx + 1) : '';
    return { qualifier, type, value: mechValue };
  });
}

function serializeSpf(mechanisms: SpfMechanism[]): string {
  const parts = mechanisms.map(m => {
    const q = m.qualifier === '+' ? '' : m.qualifier;
    const v = m.value ? `:${m.value}` : '';
    return `${q}${m.type}${v}`;
  });
  return `v=spf1 ${parts.join(' ')}`;
}

export default function SpfEditor({ value, onChange }: SpfEditorProps) {
  const [mechanisms, setMechanisms] = useState<SpfMechanism[]>(() => parseSpf(value));

  // Re-parse when external value changes (e.g., user edits raw textarea)
  useEffect(() => {
    const parsed = parseSpf(value);
    if (parsed.length > 0 || value.trim() === '' || /^v=spf1\s*$/i.test(value.trim())) {
      setMechanisms(parsed);
    }
  }, [value]);

  const update = (newMechanisms: SpfMechanism[]) => {
    setMechanisms(newMechanisms);
    onChange(serializeSpf(newMechanisms));
  };

  const addMechanism = () => {
    update([...mechanisms, { qualifier: '+', type: 'ip4', value: '' }]);
  };

  const removeMechanism = (index: number) => {
    update(mechanisms.filter((_, i) => i !== index));
  };

  const updateMechanism = (index: number, field: keyof SpfMechanism, val: string) => {
    const updated = mechanisms.map((m, i) => i === index ? { ...m, [field]: val } : m);
    update(updated);
  };

  const moveMechanism = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= mechanisms.length) return;
    const updated = [...mechanisms];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    update(updated);
  };

  const dnsLookups = mechanisms.filter(m => DNS_LOOKUP_TYPES.includes(m.type)).length;
  const needsValue = (type: string) => !['all', 'a', 'mx'].includes(type);

  return (
    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" color="textSecondary">
          SPF Editor
        </Typography>
        <Chip
          label={`DNS lookups: ${dnsLookups}/10`}
          size="small"
          color={dnsLookups > 10 ? 'error' : dnsLookups > 7 ? 'warning' : 'default'}
        />
      </Box>

      {mechanisms.map((mech, index) => (
        <Grid container spacing={1} key={index} sx={{ mb: 1, alignItems: 'center' }}>
          <Grid item xs={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Qualifier</InputLabel>
              <Select
                value={mech.qualifier}
                onChange={(e) => updateMechanism(index, 'qualifier', e.target.value)}
                label="Qualifier"
              >
                {QUALIFIERS.map(q => (
                  <MenuItem key={q.value} value={q.value}>{q.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={mech.type}
                onChange={(e) => updateMechanism(index, 'type', e.target.value)}
                label="Type"
              >
                {MECHANISM_TYPES.map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={5}>
            {needsValue(mech.type) && (
              <TextField
                fullWidth
                size="small"
                label={mech.type === 'ip4' ? 'IP/CIDR' : mech.type === 'ip6' ? 'IPv6/CIDR' : 'Domain'}
                value={mech.value}
                onChange={(e) => updateMechanism(index, 'value', e.target.value)}
                placeholder={
                  mech.type === 'ip4' ? '192.168.1.0/24' :
                  mech.type === 'ip6' ? '2001:db8::/32' :
                  '_spf.google.com'
                }
              />
            )}
          </Grid>
          <Grid item xs={2} sx={{ display: 'flex' }}>
            <IconButton size="small" onClick={() => moveMechanism(index, -1)} disabled={index === 0}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => moveMechanism(index, 1)} disabled={index === mechanisms.length - 1}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => removeMechanism(index)} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        </Grid>
      ))}

      <Button size="small" startIcon={<AddIcon />} onClick={addMechanism}>
        Add Mechanism
      </Button>
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | grep -i "SpfEditor" | head -5`
Expected: No errors mentioning SpfEditor

- [ ] **Step 3: Commit**

```bash
git add src/components/editors/SpfEditor.tsx
git commit -m "feat: add SPF guided editor component"
```

---

## Task 8: DKIM Guided Editor Component

**Files:**
- Create: `src/components/editors/DkimEditor.tsx`

- [ ] **Step 1: Implement DKIM Editor**

```tsx
// src/components/editors/DkimEditor.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';

interface DkimTags {
  k: string;
  p: string;
  t: string[];
  s: string;
}

interface DkimEditorProps {
  value: string;
  onChange: (value: string) => void;
}

function parseDkim(value: string): DkimTags {
  const defaults: DkimTags = { k: 'rsa', p: '', t: [], s: '*' };
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();

    switch (key) {
      case 'k': defaults.k = val || 'rsa'; break;
      case 'p': defaults.p = val; break;
      case 't': defaults.t = val.split(':').map(s => s.trim()).filter(Boolean); break;
      case 's': defaults.s = val || '*'; break;
    }
  }

  return defaults;
}

function serializeDkim(tags: DkimTags): string {
  const parts = ['v=DKIM1', `k=${tags.k}`];
  if (tags.t.length > 0) parts.push(`t=${tags.t.join(':')}`);
  if (tags.s !== '*') parts.push(`s=${tags.s}`);
  parts.push(`p=${tags.p}`);
  return parts.join('; ');
}

export default function DkimEditor({ value, onChange }: DkimEditorProps) {
  const [tags, setTags] = useState<DkimTags>(() => parseDkim(value));

  useEffect(() => {
    if (/v=dkim1/i.test(value)) {
      setTags(parseDkim(value));
    }
  }, [value]);

  const update = (newTags: DkimTags) => {
    setTags(newTags);
    onChange(serializeDkim(newTags));
  };

  const handleFlagToggle = (flag: string) => {
    const newFlags = tags.t.includes(flag)
      ? tags.t.filter(f => f !== flag)
      : [...tags.t, flag];
    update({ ...tags, t: newFlags });
  };

  const handleKeyPaste = (raw: string) => {
    // Strip PEM headers and whitespace
    const cleaned = raw
      .replace(/-----BEGIN [A-Z ]+-----/g, '')
      .replace(/-----END [A-Z ]+-----/g, '')
      .replace(/\s/g, '');
    update({ ...tags, p: cleaned });
  };

  return (
    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
        DKIM Editor
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Version"
            value="DKIM1"
            disabled
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Algorithm (k)</InputLabel>
            <Select
              value={tags.k}
              onChange={(e) => update({ ...tags, k: e.target.value })}
              label="Algorithm (k)"
            >
              <MenuItem value="rsa">rsa</MenuItem>
              <MenuItem value="ed25519">ed25519</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Service Type (s)"
            value={tags.s}
            onChange={(e) => update({ ...tags, s: e.target.value })}
            helperText="Default: * (all services)"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="Public Key (p)"
            value={tags.p}
            onChange={(e) => handleKeyPaste(e.target.value)}
            multiline
            rows={3}
            helperText="Paste base64-encoded public key — PEM headers and whitespace are auto-stripped"
            placeholder="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ..."
          />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Flags (t)
          </Typography>
          <FormGroup row>
            <FormControlLabel
              control={
                <Checkbox
                  checked={tags.t.includes('y')}
                  onChange={() => handleFlagToggle('y')}
                  size="small"
                />
              }
              label="y — Testing mode"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={tags.t.includes('s')}
                  onChange={() => handleFlagToggle('s')}
                  size="small"
                />
              }
              label="s — Strict alignment"
            />
          </FormGroup>
        </Grid>
      </Grid>
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | grep -i "DkimEditor" | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/editors/DkimEditor.tsx
git commit -m "feat: add DKIM guided editor component"
```

---

## Task 9: DMARC Guided Editor Component

**Files:**
- Create: `src/components/editors/DmarcEditor.tsx`

- [ ] **Step 1: Implement DMARC Editor**

```tsx
// src/components/editors/DmarcEditor.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from '@mui/material';

interface DmarcTags {
  p: string;
  sp: string;
  rua: string;
  ruf: string;
  pct: number;
  adkim: string;
  aspf: string;
}

interface DmarcEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const POLICIES = [
  { value: 'none', label: 'none — Monitor only' },
  { value: 'quarantine', label: 'quarantine — Mark as suspicious' },
  { value: 'reject', label: 'reject — Block delivery' },
];

const ALIGNMENTS = [
  { value: '', label: '(default: relaxed)' },
  { value: 'r', label: 'r — Relaxed' },
  { value: 's', label: 's — Strict' },
];

function parseDmarc(value: string): DmarcTags {
  const defaults: DmarcTags = { p: 'none', sp: '', rua: '', ruf: '', pct: 100, adkim: '', aspf: '' };
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();

    switch (key) {
      case 'p': defaults.p = val.toLowerCase(); break;
      case 'sp': defaults.sp = val.toLowerCase(); break;
      case 'rua': defaults.rua = val; break;
      case 'ruf': defaults.ruf = val; break;
      case 'pct': defaults.pct = parseInt(val, 10) || 100; break;
      case 'adkim': defaults.adkim = val.toLowerCase(); break;
      case 'aspf': defaults.aspf = val.toLowerCase(); break;
    }
  }

  return defaults;
}

function serializeDmarc(tags: DmarcTags): string {
  const parts = ['v=DMARC1', `p=${tags.p}`];
  if (tags.sp) parts.push(`sp=${tags.sp}`);
  if (tags.rua) parts.push(`rua=${tags.rua}`);
  if (tags.ruf) parts.push(`ruf=${tags.ruf}`);
  if (tags.pct !== 100) parts.push(`pct=${tags.pct}`);
  if (tags.adkim) parts.push(`adkim=${tags.adkim}`);
  if (tags.aspf) parts.push(`aspf=${tags.aspf}`);
  return parts.join('; ');
}

export default function DmarcEditor({ value, onChange }: DmarcEditorProps) {
  const [tags, setTags] = useState<DmarcTags>(() => parseDmarc(value));

  useEffect(() => {
    if (/v=dmarc1/i.test(value)) {
      setTags(parseDmarc(value));
    }
  }, [value]);

  const update = (newTags: DmarcTags) => {
    setTags(newTags);
    onChange(serializeDmarc(newTags));
  };

  return (
    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
        DMARC Editor
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Version"
            value="DMARC1"
            disabled
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Policy (p)</InputLabel>
            <Select
              value={tags.p}
              onChange={(e) => update({ ...tags, p: e.target.value })}
              label="Policy (p)"
            >
              {POLICIES.map(p => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Subdomain Policy (sp)</InputLabel>
            <Select
              value={tags.sp}
              onChange={(e) => update({ ...tags, sp: e.target.value })}
              label="Subdomain Policy (sp)"
            >
              <MenuItem value="">(inherit from p)</MenuItem>
              {POLICIES.map(p => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            size="small"
            label="Aggregate Report URI (rua)"
            value={tags.rua}
            onChange={(e) => update({ ...tags, rua: e.target.value })}
            placeholder="mailto:dmarc-reports@example.com"
            helperText="Where to send aggregate DMARC reports"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            size="small"
            label="Forensic Report URI (ruf)"
            value={tags.ruf}
            onChange={(e) => update({ ...tags, ruf: e.target.value })}
            placeholder="mailto:dmarc-forensics@example.com"
            helperText="Where to send failure reports (optional)"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Percentage (pct): {tags.pct}%
          </Typography>
          <Slider
            value={tags.pct}
            onChange={(_, val) => update({ ...tags, pct: val as number })}
            min={0}
            max={100}
            step={1}
            valueLabelDisplay="auto"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>DKIM Alignment (adkim)</InputLabel>
            <Select
              value={tags.adkim}
              onChange={(e) => update({ ...tags, adkim: e.target.value })}
              label="DKIM Alignment (adkim)"
            >
              {ALIGNMENTS.map(a => (
                <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>SPF Alignment (aspf)</InputLabel>
            <Select
              value={tags.aspf}
              onChange={(e) => update({ ...tags, aspf: e.target.value })}
              label="SPF Alignment (aspf)"
            >
              {ALIGNMENTS.map(a => (
                <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </Box>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | grep -i "DmarcEditor" | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/editors/DmarcEditor.tsx
git commit -m "feat: add DMARC guided editor component"
```

---

## Task 10: Integrate Guided Editors into AddDNSRecord

**Files:**
- Modify: `src/components/AddDNSRecord.tsx`

- [ ] **Step 1: Add imports and detection state**

Add these imports near the top of AddDNSRecord.tsx (after existing imports):

```typescript
import { detectTxtSubtype, TxtSubtype } from '../services/validators/detectTxtSubtype';
import SpfEditor from './editors/SpfEditor';
import DkimEditor from './editors/DkimEditor';
import DmarcEditor from './editors/DmarcEditor';
```

Inside the component function, add state for the detected subtype:

```typescript
const [txtSubtype, setTxtSubtype] = useState<TxtSubtype | null>(null);
```

- [ ] **Step 2: Add detection on value change**

In the `handleFieldChange` function, after updating the record state, add detection when the type is TXT:

```typescript
// Detect TXT subtype when value changes
if (record.type === 'TXT' && field === 'value') {
  setTxtSubtype(detectTxtSubtype(value as string, record.name));
}
```

Also detect on type change — when the user switches to TXT, run detection on the current value:

```typescript
if (field === 'type' && value === 'TXT') {
  setTxtSubtype(detectTxtSubtype(record.value as string || '', record.name));
} else if (field === 'type' && value !== 'TXT') {
  setTxtSubtype(null);
}
```

And detect when name changes (for DKIM/DMARC name-based detection):

```typescript
if (record.type === 'TXT' && field === 'name') {
  setTxtSubtype(detectTxtSubtype(record.value as string || '', value as string));
}
```

- [ ] **Step 3: Render guided editor below TXT textarea**

In the JSX where TXT fields are rendered (in the field mapping loop, around line 572-609), add the guided editor after the textarea:

After the existing TextField for TXT value, add:

```tsx
{record.type === 'TXT' && txtSubtype && (
  <>
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
  </>
)}
```

- [ ] **Step 4: Surface validation warnings**

After the existing validation error display, add warning display. Find where `validationErrors` are shown and add:

```tsx
{record.type === 'TXT' && txtSubtype && (
  <Box sx={{ mt: 1 }}>
    {/* Warnings from subtype validation are shown inline by the validation service */}
  </Box>
)}
```

The existing validation flow in `validateFields()` already calls `DNSValidationService.validateRecord()` which now returns warnings. Update the validation handling to also surface warnings. In the `validateFields` function, after the errors check, capture and display warnings:

Find the spot where validation result is used and add warning state + display:

```typescript
const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
```

In each validation branch of `validateFields`, after checking `validation.isValid`, capture warnings:

```typescript
setValidationWarnings(validation.warnings || []);
```

Display warnings in the form with MUI Alert components:

```tsx
{validationWarnings.length > 0 && (
  <Grid item xs={12}>
    {validationWarnings.map((warning, i) => (
      <Alert key={i} severity="warning" sx={{ mb: 1 }}>{warning}</Alert>
    ))}
  </Grid>
)}
```

Add the `Alert` import from `@mui/material` if not already present.

- [ ] **Step 5: Verify it compiles**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors related to AddDNSRecord

- [ ] **Step 6: Commit**

```bash
git add src/components/AddDNSRecord.tsx
git commit -m "feat: integrate guided SPF/DKIM/DMARC editors into AddDNSRecord form"
```

---

## Task 11: Integrate Guided Editors into RecordEditor

**Files:**
- Modify: `src/components/RecordEditor.tsx` (lines 257-275 for TXT rendering, lines 311-334 for conditional)

- [ ] **Step 1: Add imports and detection**

Add imports at the top of `src/components/RecordEditor.tsx`:

```typescript
import { detectTxtSubtype, TxtSubtype } from '../services/validators/detectTxtSubtype';
import SpfEditor from './editors/SpfEditor';
import DkimEditor from './editors/DkimEditor';
import DmarcEditor from './editors/DmarcEditor';
import { Alert } from '@mui/material';
```

Add state inside the component:

```typescript
const [txtSubtype, setTxtSubtype] = useState<TxtSubtype | null>(null);
```

Add an effect to detect subtype when the record loads:

```typescript
useEffect(() => {
  if (record.type === 'TXT' && typeof record.value === 'string') {
    setTxtSubtype(detectTxtSubtype(record.value, record.name));
  }
}, [record]);
```

- [ ] **Step 2: Update renderTXTFields to include guided editor**

Replace the `renderTXTFields` function (lines 257-275) with:

```typescript
  const renderTXTFields = () => {
    if (record.type !== 'TXT') return null;

    const handleTxtChange = (val: string) => {
      handleChange('value', val);
      setTxtSubtype(detectTxtSubtype(val, editedRecord.name));
    };

    return (
      <>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Text Value"
            value={editedRecord.value as string}
            onChange={(e) => handleTxtChange(e.target.value)}
            multiline
            rows={4}
            helperText="Enter text content exactly as needed - no quotes will be added"
          />
        </Grid>
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
      </>
    );
  };
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | head -30`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/RecordEditor.tsx
git commit -m "feat: integrate guided SPF/DKIM/DMARC editors into RecordEditor"
```

---

## Task 12: Surface Backend Warnings in PendingChangesDrawer

**Files:**
- Modify: `src/components/PendingChangesDrawer.tsx`

- [ ] **Step 1: Add warning state and snackbar display**

In `PendingChangesDrawer.tsx`, the `handleApplyChanges` function calls `dnsService.addRecord()`, `dnsService.deleteRecord()`, and `dnsService.updateRecord()`. These now return a response that may include `warnings`.

After each successful DNS operation in the apply loop, collect warnings from the response:

```typescript
const allWarnings: string[] = [];
```

After each operation result (e.g., `const result = await dnsService.addRecord(...)`), check for warnings:

```typescript
if (result.warnings && result.warnings.length > 0) {
  allWarnings.push(...result.warnings);
}
```

After all changes are applied successfully, if there are warnings, show them in a Snackbar/Alert:

```typescript
if (allWarnings.length > 0) {
  setApplyWarnings(allWarnings);
}
```

Add state and a Snackbar at the bottom of the drawer:

```typescript
const [applyWarnings, setApplyWarnings] = useState<string[]>([]);
```

```tsx
<Snackbar
  open={applyWarnings.length > 0}
  autoHideDuration={10000}
  onClose={() => setApplyWarnings([])}
>
  <Alert severity="warning" onClose={() => setApplyWarnings([])}>
    {applyWarnings.map((w, i) => <div key={i}>{w}</div>)}
  </Alert>
</Snackbar>
```

Add `Snackbar` to the MUI imports.

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/PendingChangesDrawer.tsx
git commit -m "feat: surface backend validation warnings in snackbar after applying changes"
```

---

## Task 13: E2E Tests — Guided Editors

**Files:**
- Create: `tests/e2e/txt-subtype-editors.spec.ts`

- [ ] **Step 1: Write E2E tests for guided editor auto-detection**

```typescript
// tests/e2e/txt-subtype-editors.spec.ts
import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3001';

test.describe('TXT Subtype Guided Editors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    // Login if auth is required — adapt to your auth setup
    // Navigate to add record page
    await page.goto(`${TEST_URL}/`);
  });

  test('SPF editor appears when typing v=spf1', async ({ page }) => {
    // Select TXT record type
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    // Type SPF prefix into value field
    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=spf1 ');

    // Verify SPF editor appears
    await expect(page.getByText('SPF Editor')).toBeVisible();
    await expect(page.getByText('DNS lookups:')).toBeVisible();
  });

  test('DKIM editor appears when typing v=DKIM1', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=DKIM1; k=rsa; p=ABC');

    await expect(page.getByText('DKIM Editor')).toBeVisible();
  });

  test('DMARC editor appears when typing v=DMARC1', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=DMARC1; p=none');

    await expect(page.getByText('DMARC Editor')).toBeVisible();
  });

  test('SPF editor adds mechanism and updates raw value', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=spf1 ~all');

    // Click "Add Mechanism" button
    await page.getByText('Add Mechanism').click();

    // The raw textarea should update to reflect the new mechanism
    const updatedValue = await valueField.inputValue();
    expect(updatedValue).toContain('v=spf1');
  });

  test('guided editor activates when editing existing SPF in ZoneEditor', async ({ page }) => {
    // Navigate to zone editor (requires a zone with existing SPF record)
    await page.goto(`${TEST_URL}/zones`);

    // Select a key and zone that has SPF records (test.local has one)
    // This depends on test environment having a zone selected
    // Find the SPF TXT record row and click edit
    const spfRow = page.locator('tr').filter({ hasText: 'v=spf1' }).first();
    if (await spfRow.isVisible()) {
      const editButton = spfRow.getByRole('button', { name: /edit/i });
      await editButton.click();

      // The RecordEditor dialog should show the SPF editor
      await expect(page.getByText('SPF Editor')).toBeVisible();
    }
  });

  test('no editor appears for plain TXT', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('just a plain text record');

    await expect(page.getByText('SPF Editor')).not.toBeVisible();
    await expect(page.getByText('DKIM Editor')).not.toBeVisible();
    await expect(page.getByText('DMARC Editor')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/txt-subtype-editors.spec.ts
git commit -m "test: add E2E tests for TXT subtype guided editor auto-detection"
```

---

## Task 14: E2E Tests — Validation Behavior

**Files:**
- Create: `tests/e2e/txt-validation.spec.ts`

- [ ] **Step 1: Write E2E tests for validation errors and warnings**

```typescript
// tests/e2e/txt-validation.spec.ts
import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3001';

test.describe('TXT Subtype Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${TEST_URL}/`);
  });

  test('SPF with +all shows warning but allows submission', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    // Fill name
    const nameField = page.locator('input[name="name"]');
    await nameField.fill('@');

    // Fill SPF value with +all
    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=spf1 mx +all');

    // The warning should appear (not an error that blocks)
    await expect(page.getByText(/allows any server/i)).toBeVisible();
  });

  test('SPF with unknown mechanism shows error', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    const nameField = page.locator('input[name="name"]');
    await nameField.fill('@');

    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=spf1 bogus:foo ~all');

    // Try to submit — should be blocked
    const addButton = page.getByRole('button', { name: /add record/i });
    await addButton.click();

    // Should see an error
    await expect(page.getByText(/unknown mechanism/i)).toBeVisible();
  });

  test('DKIM with invalid base64 shows error', async ({ page }) => {
    const typeSelect = page.locator('#record-type-select');
    await typeSelect.click();
    await page.locator('[role="option"]').filter({ hasText: 'TXT' }).click();

    const nameField = page.locator('input[name="name"]');
    await nameField.fill('selector1._domainkey');

    const valueField = page.locator('textarea[name="value"], input[name="value"]').first();
    await valueField.fill('v=DKIM1; k=rsa; p=not!!!valid!!!base64');

    const addButton = page.getByRole('button', { name: /add record/i });
    await addButton.click();

    await expect(page.getByText(/base64/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/txt-validation.spec.ts
git commit -m "test: add E2E tests for TXT subtype validation errors and warnings"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run all unit tests**

Run: `cd /home/ttpearso/git/snap-dns && npx jest src/services/validators/ --no-cache 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 2: Run frontend type check**

Run: `cd /home/ttpearso/git/snap-dns && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 3: Run backend type check**

Run: `cd /home/ttpearso/git/snap-dns/backend && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 4: Run frontend build**

Run: `cd /home/ttpearso/git/snap-dns && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Run E2E tests (if test environment available)**

Run: `cd /home/ttpearso/git/snap-dns && TEST_URL=http://localhost:3001 npx playwright test tests/e2e/txt-subtype-editors.spec.ts tests/e2e/txt-validation.spec.ts 2>&1 | tail -30`
Expected: Tests pass (or skip gracefully if test env not running)

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
