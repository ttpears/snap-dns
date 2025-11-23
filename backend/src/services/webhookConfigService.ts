// backend/src/services/webhookConfigService.ts
// Server-side webhook configuration storage and management

import { promises as fs } from 'fs';
import path from 'path';

const WEBHOOK_CONFIG_FILE = path.join(process.cwd(), 'data', 'webhook-configs.json');

export interface WebhookConfig {
  userId: string;
  webhookUrl: string | null;
  webhookProvider: 'mattermost' | 'slack' | 'discord' | 'teams' | 'generic' | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class WebhookConfigService {
  private configs: Map<string, WebhookConfig> = new Map();
  private initialized = false;

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(path.dirname(WEBHOOK_CONFIG_FILE), { recursive: true });

      try {
        const data = await fs.readFile(WEBHOOK_CONFIG_FILE, 'utf-8');
        const configsArray: WebhookConfig[] = JSON.parse(data);

        configsArray.forEach(config => {
          config.createdAt = new Date(config.createdAt);
          config.updatedAt = new Date(config.updatedAt);
          this.configs.set(config.userId, config);
        });

        console.log(`Loaded ${this.configs.size} webhook configurations from disk`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log('No existing webhook configurations file');
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize webhook config service:', error);
      throw error;
    }
  }

  /**
   * Save configs to disk
   */
  private async saveConfigs(): Promise<void> {
    const configsArray = Array.from(this.configs.values());
    await fs.writeFile(WEBHOOK_CONFIG_FILE, JSON.stringify(configsArray, null, 2), 'utf-8');
  }

  /**
   * Get webhook configuration for a user
   */
  async getConfig(userId: string): Promise<WebhookConfig | null> {
    if (!this.initialized) await this.initialize();

    return this.configs.get(userId) || null;
  }

  /**
   * Set webhook configuration for a user
   */
  async setConfig(
    userId: string,
    webhookUrl: string | null,
    webhookProvider: WebhookConfig['webhookProvider'],
    enabled: boolean = true
  ): Promise<WebhookConfig> {
    if (!this.initialized) await this.initialize();

    const existingConfig = this.configs.get(userId);
    const now = new Date();

    const config: WebhookConfig = {
      userId,
      webhookUrl,
      webhookProvider,
      enabled,
      createdAt: existingConfig?.createdAt || now,
      updatedAt: now,
    };

    this.configs.set(userId, config);
    await this.saveConfigs();

    console.log(`Webhook config updated for user ${userId}`);
    return config;
  }

  /**
   * Delete webhook configuration for a user
   */
  async deleteConfig(userId: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    this.configs.delete(userId);
    await this.saveConfigs();

    console.log(`Webhook config deleted for user ${userId}`);
  }

  /**
   * Get all webhook configurations (admin only)
   */
  async getAllConfigs(): Promise<WebhookConfig[]> {
    if (!this.initialized) await this.initialize();

    return Array.from(this.configs.values());
  }
}

export const webhookConfigService = new WebhookConfigService();
