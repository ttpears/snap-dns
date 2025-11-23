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
