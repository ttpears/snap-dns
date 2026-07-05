// backend/src/services/msalService.ts
import * as msal from '@azure/msal-node';
import { ssoConfigService } from './ssoConfigService';
import { SSOProvider, IdTokenClaims } from '../types/sso';

// Multi-tenant authority segments. When the configured tenant is one of these,
// the id_token `iss` carries the caller's real tenant GUID rather than the
// placeholder, so the issuer is matched by shape instead of exact string.
const MULTI_TENANT_SEGMENTS = new Set(['common', 'organizations', 'consumers']);

// Entra ID v2.0 issuer for a concrete tenant GUID.
const ENTRA_V2_ISSUER = (tenantId: string): string =>
  `https://login.microsoftonline.com/${tenantId}/v2.0`;

// Matches a v2.0 issuer for any tenant GUID (used for multi-tenant configs).
const ENTRA_V2_ISSUER_PATTERN =
  /^https:\/\/login\.microsoftonline\.com\/[0-9a-fA-F-]{36}\/v2\.0$/;

export interface ClaimsValidationOptions {
  // Configured tenant id (GUID, or a multi-tenant segment such as "common").
  tenantId: string;
  // Expected audience — the application's client id.
  audience: string;
  // Nonce issued at /signin; when provided, the id_token nonce must match it.
  nonce?: string;
  // Overridable clock (seconds since epoch) for testing.
  nowSeconds?: number;
  // Allowed clock skew when checking exp/nbf.
  clockSkewSeconds?: number;
}

function issuerMatches(actual: string, tenantId: string): boolean {
  if (MULTI_TENANT_SEGMENTS.has(tenantId.toLowerCase())) {
    return ENTRA_V2_ISSUER_PATTERN.test(actual);
  }
  return actual === ENTRA_V2_ISSUER(tenantId);
}

/**
 * Assert that an id_token's security-critical claims are trustworthy before a
 * session is minted from them. MSAL already parses (and, during the
 * authorization-code exchange, validates) these claims; this is a defensive,
 * dependency-free second check of issuer / audience / expiry / not-before /
 * nonce so a misconfiguration or future flow change cannot silently create a
 * session from an untrusted token.
 *
 * Pure and side-effect free so it can be unit-tested directly. Throws on any
 * failure; returns void on success.
 */
export function validateIdTokenClaims(
  claims: IdTokenClaims,
  options: ClaimsValidationOptions
): void {
  const skew = options.clockSkewSeconds ?? 300;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  // Issuer must match the configured Entra tenant authority.
  if (typeof claims.iss !== 'string' || !issuerMatches(claims.iss, options.tenantId)) {
    throw new Error('ID token issuer mismatch');
  }

  // Audience must be (or include) our client id.
  const aud = claims.aud;
  const audienceOk = Array.isArray(aud)
    ? aud.includes(options.audience)
    : aud === options.audience;
  if (!audienceOk) {
    throw new Error('ID token audience mismatch');
  }

  // Expiry must be present and in the future (allowing for clock skew).
  if (typeof claims.exp !== 'number' || now > claims.exp + skew) {
    throw new Error('ID token expired or missing exp');
  }

  // Not-before, when present, must not be in the future (allowing for skew).
  if (typeof claims.nbf === 'number' && now + skew < claims.nbf) {
    throw new Error('ID token not yet valid (nbf)');
  }

  // Nonce, when we issued one, must match to defend against token replay.
  if (options.nonce !== undefined && claims.nonce !== options.nonce) {
    throw new Error('ID token nonce mismatch');
  }
}

class MSALService {
  private msalClient: msal.ConfidentialClientApplication | null = null;
  private initialized = false;

  /**
   * Initialize MSAL client with current SSO configuration
   */
  async initialize(): Promise<void> {
    const config = await ssoConfigService.getFullConfig();

    if (!config?.enabled || config.provider !== SSOProvider.M365) {
      console.log('SSO not enabled or not using M365, skipping MSAL initialization');
      this.msalClient = null;
      this.initialized = false;
      return;
    }

    if (!config.clientId || !config.tenantId || !config.clientSecret) {
      console.warn('M365 SSO enabled but missing required configuration');
      this.msalClient = null;
      this.initialized = false;
      return;
    }

    try {
      const msalConfig: msal.Configuration = {
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          clientSecret: config.clientSecret,
        },
        system: {
          loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
              if (containsPii) return;
              switch (level) {
                case msal.LogLevel.Error:
                  console.error('[MSAL]', message);
                  break;
                case msal.LogLevel.Warning:
                  console.warn('[MSAL]', message);
                  break;
                case msal.LogLevel.Info:
                  console.info('[MSAL]', message);
                  break;
              }
            },
            piiLoggingEnabled: false,
            logLevel: msal.LogLevel.Warning,
          },
        },
      };

      this.msalClient = new msal.ConfidentialClientApplication(msalConfig);
      this.initialized = true;
      console.log('✅ MSAL service initialized for M365 SSO');
    } catch (error) {
      console.error('Failed to initialize MSAL:', error);
      this.msalClient = null;
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Check if MSAL is initialized and ready
   */
  isReady(): boolean {
    return this.initialized && this.msalClient !== null;
  }

  /**
   * Get authorization URL for user sign-in
   */
  async getAuthCodeUrl(state: string, redirectUri: string, nonce?: string): Promise<string> {
    if (!this.isReady()) {
      await this.initialize();
    }

    if (!this.msalClient) {
      throw new Error('MSAL not initialized');
    }

    const authCodeUrlParameters: msal.AuthorizationUrlRequest = {
      scopes: ['User.Read', 'email', 'profile', 'openid'],
      redirectUri: redirectUri,
      state: state,
      prompt: 'select_account', // Force account selection
    };

    // Bind a nonce into the request so it is embedded in the returned id_token;
    // validated at callback to defend against token replay.
    if (nonce) {
      authCodeUrlParameters.nonce = nonce;
    }

    return await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
  }

  /**
   * Exchange authorization code for tokens
   */
  async acquireTokenByCode(code: string, redirectUri: string): Promise<msal.AuthenticationResult> {
    if (!this.isReady()) {
      await this.initialize();
    }

    if (!this.msalClient) {
      throw new Error('MSAL not initialized');
    }

    const tokenRequest: msal.AuthorizationCodeRequest = {
      code: code,
      scopes: ['User.Read', 'email', 'profile', 'openid'],
      redirectUri: redirectUri,
    };

    return await this.msalClient.acquireTokenByCode(tokenRequest);
  }

  /**
   * Get logout URL
   */
  async getLogoutUrl(postLogoutRedirectUri?: string): Promise<string> {
    const config = await ssoConfigService.getFullConfig();

    if (!config || !config.tenantId) {
      throw new Error('SSO not configured');
    }

    const logoutUri = postLogoutRedirectUri || config.postLogoutRedirectUri || '';
    return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(logoutUri)}`;
  }

  /**
   * Return the id_token claims from a token response, but only after asserting
   * they are trustworthy (issuer / audience / expiry / nonce).
   *
   * Trust model: `acquireTokenByCode` is a server-to-server call to the Entra
   * token endpoint over TLS, and MSAL itself parses and validates the id_token
   * during that exchange, exposing the result as `AuthenticationResult
   * .idTokenClaims`. We therefore consume MSAL's already-validated claims rather
   * than hand-decoding the raw JWT (the previous behaviour) — this avoids
   * rolling our own JWKS-based signature verification while still refusing to
   * mint a session from a token whose issuer/audience/expiry/nonce do not match
   * the configured tenant/client and the nonce we issued at /signin.
   *
   * @param expectedNonce the nonce issued at /signin (bound into the id_token).
   */
  async getValidatedIdTokenClaims(
    tokenResponse: msal.AuthenticationResult,
    expectedNonce?: string
  ): Promise<IdTokenClaims> {
    const config = await ssoConfigService.getFullConfig();
    if (!config?.clientId || !config?.tenantId) {
      throw new Error('SSO not configured');
    }

    const claims = tokenResponse.idTokenClaims as IdTokenClaims | undefined;
    if (!claims) {
      // MSAL always populates idTokenClaims on a successful code exchange; a
      // missing value means the response is not one we should trust.
      throw new Error('ID token claims missing from token response');
    }

    validateIdTokenClaims(claims, {
      tenantId: config.tenantId,
      audience: config.clientId,
      nonce: expectedNonce,
    });

    return claims;
  }
}

export const msalService = new MSALService();
