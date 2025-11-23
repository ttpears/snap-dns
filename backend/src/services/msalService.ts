// backend/src/services/msalService.ts
import * as msal from '@azure/msal-node';
import { ssoConfigService } from './ssoConfigService';
import { SSOProvider } from '../types/sso';

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
  async getAuthCodeUrl(state: string, redirectUri: string): Promise<string> {
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
   * Validate and decode ID token
   */
  decodeIdToken(idToken: string): any {
    try {
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        Buffer.from(base64, 'base64')
          .toString()
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Failed to decode ID token:', error);
      throw new Error('Invalid ID token');
    }
  }
}

export const msalService = new MSALService();
