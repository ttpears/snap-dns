// backend/src/services/ssoConfigService.ts
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SSOConfig, SSOConfigResponse, SSOProvider } from '../types/sso';

const SSO_CONFIG_FILE = path.join(process.cwd(), 'data', 'sso-config.json');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production';

class SSOConfigService {
  private config: SSOConfig | null = null;
  private initialized = false;

  /**
   * Initialize SSO config service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(SSO_CONFIG_FILE), { recursive: true });

      // Try to load existing config
      try {
        const data = await fs.readFile(SSO_CONFIG_FILE, 'utf-8');
        const storedConfig = JSON.parse(data);

        // Decrypt client secret if present
        if (storedConfig.clientSecret) {
          storedConfig.clientSecret = this.decrypt(storedConfig.clientSecret);
        }

        this.config = storedConfig;
        if (this.config) {
          console.log(`SSO config loaded: ${this.config.enabled ? 'enabled' : 'disabled'} (${this.config.provider})`);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // No config file, use defaults
          this.config = {
            enabled: false,
            provider: SSOProvider.DISABLED,
          };
          console.log('No SSO config found, using defaults (disabled)');
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize SSO config service:', error);
      throw error;
    }
  }

  /**
   * Get SSO configuration (without sensitive data)
   */
  async getConfig(): Promise<SSOConfigResponse> {
    if (!this.initialized) await this.initialize();

    if (!this.config) {
      return {
        enabled: false,
        provider: SSOProvider.DISABLED,
      };
    }

    // Return config without client secret
    return {
      enabled: this.config.enabled,
      provider: this.config.provider,
      clientId: this.config.clientId,
      tenantId: this.config.tenantId,
      redirectUri: this.config.redirectUri,
      postLogoutRedirectUri: this.config.postLogoutRedirectUri,
      adminGroups: this.config.adminGroups,
      editorGroups: this.config.editorGroups,
    };
  }

  /**
   * Update SSO configuration
   */
  async updateConfig(newConfig: Partial<SSOConfig>): Promise<void> {
    if (!this.initialized) await this.initialize();

    // Merge with existing config
    this.config = {
      ...this.config,
      ...newConfig,
    } as SSOConfig;

    // Prepare config for storage (encrypt client secret)
    const configToStore = { ...this.config };
    if (configToStore.clientSecret) {
      configToStore.clientSecret = this.encrypt(configToStore.clientSecret);
    }

    // Save to file
    await fs.writeFile(SSO_CONFIG_FILE, JSON.stringify(configToStore, null, 2), 'utf-8');

    console.log(`SSO config updated: ${this.config.enabled ? 'enabled' : 'disabled'} (${this.config.provider})`);
  }

  /**
   * Check if SSO is enabled
   */
  async isEnabled(): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    return this.config?.enabled || false;
  }

  /**
   * Get full config (including secrets) for internal use
   */
  async getFullConfig(): Promise<SSOConfig | null> {
    if (!this.initialized) await this.initialize();
    return this.config;
  }

  /**
   * Encrypt a string using AES-256-CBC
   */
  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt a string using AES-256-CBC
   */
  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export const ssoConfigService = new SSOConfigService();
