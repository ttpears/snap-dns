// backend/src/types/sso.ts

export enum SSOProvider {
  M365 = 'm365',
  DISABLED = 'disabled',
}

export interface SSOConfig {
  enabled: boolean;
  provider: SSOProvider;
  // M365/Azure AD settings
  clientId?: string;
  tenantId?: string;
  clientSecret?: string;
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  // Optional: Group-based role mapping
  adminGroups?: string[];
  editorGroups?: string[];
}

export interface SSOConfigResponse {
  enabled: boolean;
  provider: SSOProvider;
  clientId?: string;
  tenantId?: string;
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  adminGroups?: string[];
  editorGroups?: string[];
  // Note: clientSecret is NEVER returned
}

/**
 * Pending OAuth2 authorization-code-flow state, created at /signin and consumed
 * once at /callback. Stashed on the express session (see augmentation below) so
 * it survives backend restarts and multi-instance deployments, and is scoped to
 * the browser session rather than a process-global map.
 */
export interface PendingSSOState {
  // Opaque CSRF token echoed back by the IdP in the callback `state` param.
  state: string;
  // Opaque nonce bound into the id_token to defend against token replay.
  nonce: string;
  // Redirect URI used for the auth request; must match on token exchange.
  redirectUri: string;
  // Creation time (ms epoch); used to expire abandoned in-flight logins.
  timestamp: number;
}

/**
 * Subset of Entra ID id_token claims this app relies on. MSAL populates and
 * validates these during the authorization-code exchange; we additionally
 * assert issuer/audience/expiry/nonce before trusting them (see msalService).
 */
export interface IdTokenClaims {
  // Standard OIDC claims used for validation.
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  nonce?: string;
  // Identity claims used for JIT provisioning.
  oid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  roles?: string[];
  [claim: string]: unknown;
}

// Bind the pending SSO state onto the express session type so route handlers can
// read/write req.session.ssoState with full type-safety.
declare module 'express-session' {
  interface SessionData {
    ssoState?: PendingSSOState;
  }
}
