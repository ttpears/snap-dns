// backend/src/services/__tests__/msalService.validation.test.ts
// Unit tests for validateIdTokenClaims: acceptance of well-formed Entra ID
// claims and rejection on issuer/audience/expiry/not-before/nonce failures.
// Pure-function tests — no MSAL client or network involved.
import { validateIdTokenClaims, ClaimsValidationOptions } from '../msalService';
import { IdTokenClaims } from '../../types/sso';

const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NOW = 1_700_000_000; // fixed clock (seconds)

function validClaims(overrides: Partial<IdTokenClaims> = {}): IdTokenClaims {
  return {
    iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    aud: CLIENT_ID,
    exp: NOW + 3600,
    nbf: NOW - 60,
    nonce: 'nonce-123',
    oid: 'user-oid',
    preferred_username: 'user@example.com',
    ...overrides,
  };
}

function opts(overrides: Partial<ClaimsValidationOptions> = {}): ClaimsValidationOptions {
  return {
    tenantId: TENANT_ID,
    audience: CLIENT_ID,
    nonce: 'nonce-123',
    nowSeconds: NOW,
    ...overrides,
  };
}

describe('validateIdTokenClaims — acceptance', () => {
  it('accepts well-formed claims with matching issuer/audience/expiry/nonce', () => {
    expect(() => validateIdTokenClaims(validClaims(), opts())).not.toThrow();
  });

  it('accepts an audience array containing the client id', () => {
    expect(() =>
      validateIdTokenClaims(validClaims({ aud: ['other', CLIENT_ID] }), opts())
    ).not.toThrow();
  });

  it('accepts a multi-tenant config where iss carries a concrete tenant GUID', () => {
    const claims = validClaims({
      iss: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    });
    expect(() => validateIdTokenClaims(claims, opts({ tenantId: 'common' }))).not.toThrow();
  });

  it('does not check nonce when none was issued', () => {
    const claims = validClaims({ nonce: undefined });
    expect(() => validateIdTokenClaims(claims, opts({ nonce: undefined }))).not.toThrow();
  });

  it('tolerates a claim within the allowed clock skew for exp', () => {
    const claims = validClaims({ exp: NOW - 100 }); // just expired
    expect(() =>
      validateIdTokenClaims(claims, opts({ clockSkewSeconds: 300 }))
    ).not.toThrow();
  });
});

describe('validateIdTokenClaims — rejection', () => {
  it('rejects an issuer for the wrong tenant', () => {
    const claims = validClaims({
      iss: 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0',
    });
    expect(() => validateIdTokenClaims(claims, opts())).toThrow(/issuer/i);
  });

  it('rejects a non-Microsoft issuer', () => {
    const claims = validClaims({ iss: 'https://evil.example.com/v2.0' });
    expect(() => validateIdTokenClaims(claims, opts())).toThrow(/issuer/i);
  });

  it('rejects a missing issuer', () => {
    const claims = validClaims({ iss: undefined });
    expect(() => validateIdTokenClaims(claims, opts())).toThrow(/issuer/i);
  });

  it('rejects a wrong audience', () => {
    const claims = validClaims({ aud: 'some-other-client' });
    expect(() => validateIdTokenClaims(claims, opts())).toThrow(/audience/i);
  });

  it('rejects an audience array without the client id', () => {
    const claims = validClaims({ aud: ['x', 'y'] });
    expect(() => validateIdTokenClaims(claims, opts())).toThrow(/audience/i);
  });

  it('rejects an expired token (beyond clock skew)', () => {
    const claims = validClaims({ exp: NOW - 1000 });
    expect(() =>
      validateIdTokenClaims(claims, opts({ clockSkewSeconds: 300 }))
    ).toThrow(/expired/i);
  });

  it('rejects a missing exp', () => {
    const claims = validClaims({ exp: undefined });
    expect(() => validateIdTokenClaims(claims, opts())).toThrow(/exp/i);
  });

  it('rejects a token that is not yet valid (nbf in the future beyond skew)', () => {
    const claims = validClaims({ nbf: NOW + 1000 });
    expect(() =>
      validateIdTokenClaims(claims, opts({ clockSkewSeconds: 300 }))
    ).toThrow(/not yet valid/i);
  });

  it('rejects a nonce mismatch', () => {
    const claims = validClaims({ nonce: 'attacker-nonce' });
    expect(() => validateIdTokenClaims(claims, opts({ nonce: 'nonce-123' }))).toThrow(
      /nonce/i
    );
  });

  it('rejects when a nonce was expected but the token has none', () => {
    const claims = validClaims({ nonce: undefined });
    expect(() => validateIdTokenClaims(claims, opts({ nonce: 'nonce-123' }))).toThrow(
      /nonce/i
    );
  });
});
