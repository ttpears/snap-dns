import { WebhookProvider, WebhookPayload } from '../types/webhook';

interface BackupNotification {
  zone: string;
  type: string;
  timestamp: number;
  records: any[];
}

class NotificationService {
  private webhookUrl: string | null = null;
  private webhookProvider: WebhookProvider = 'mattermost';
  private readonly apiUrl: string;

  constructor() {
    this.apiUrl = (process.env.REACT_APP_API_URL || '').replace(/\/api$/, '');
    if (!this.apiUrl) {
      console.error('REACT_APP_API_URL is not configured!');
    }
    this.migrateExistingConfig();
  }

  private migrateExistingConfig() {
    try {
      const config = localStorage.getItem('dns_manager_config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        if (parsedConfig.webhookUrl && !parsedConfig.webhookProvider) {
          console.log('Migrating existing webhook configuration');
          this.setWebhookConfig(parsedConfig.webhookUrl, 'mattermost');
        }
      }
    } catch (error) {
      console.error('Error migrating webhook configuration:', error);
    }
  }

  setWebhookConfig(url: string, provider: WebhookProvider = 'mattermost') {
    this.webhookUrl = url;
    this.webhookProvider = provider;
  }

  async notifyBackupCreated(backup: BackupNotification) {
    if (!this.webhookUrl) {
      console.log('No webhook URL configured, skipping backup notification');
      return;
    }

    try {
      const payload: WebhookPayload = {
        text: `### DNS Backup Created
**Zone:** ${backup.zone}
**Type:** ${backup.type}
**Time:** ${new Date(backup.timestamp).toLocaleString()}
**Records:** ${backup.records.length}`,
        username: 'DNS Manager',
        icon_emoji: ':floppy_disk:'
      };

      await this.sendWebhook(payload);
    } catch (error) {
      console.error('Failed to send backup notification:', error);
    }
  }

  async sendNotification(zone: string, changes: any[]) {
    if (!this.webhookUrl) {
      console.log('No webhook URL configured, skipping notification');
      return;
    }

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      console.log('No changes to notify about');
      return;
    }

    try {
      const timestamp = Date.now();
      const changesSummary = this.formatChangesSummary(changes);
      const message = this.formatMessage(zone, changesSummary, timestamp);

      console.log('Sending notification:', {
        zone,
        changesCount: changes.length,
        webhookUrl: this.webhookUrl,
        provider: this.webhookProvider
      });

      const payload: WebhookPayload = {
        text: message,
        username: 'DNS Manager',
        icon_emoji: ':pencil:'
      };

      await this.sendWebhook(payload);
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
      throw error;
    }
  }

  private async sendWebhook(payload: WebhookPayload) {
    if (!this.webhookUrl) {
      console.warn('Webhook URL is not configured');
      return;
    }

    const config = {
      provider: this.webhookProvider,
      url: this.webhookUrl
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('http://localhost:3002/api/webhook/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config,
          payload
        }),
        signal: controller.signal
      });

      const responseClone = response.clone();
      
      try {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || data.details || `HTTP error! status: ${response.status}`);
        }
        return data;
      } catch (e) {
        const text = await responseClone.text();
        throw new Error(text || `HTTP error! status: ${response.status}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds');
      }
      console.error('Webhook error:', error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatChangesSummary(changes: any[]): string {
    if (!Array.isArray(changes)) {
      console.error('Changes must be an array:', changes);
      return 'Invalid changes format';
    }

    const sections: { [key: string]: string[] } = {
      added: [],
      modified: [],
      deleted: []
    };

    changes.forEach(change => {
      if (!change || !change.type) {
        console.error('Invalid change object:', change);
        return;
      }

      try {
        switch (change.type) {
          case 'DELETE':
            if (change.record) {
              sections.deleted.push(
                `• \`${change.record.name}\` ${change.record.type} record\n` +
                `  Value: \`${change.record.value}\``
              );
            }
            break;
            
          case 'MODIFY':
            if (change.originalRecord && change.newRecord) {
              sections.modified.push(
                `• \`${change.originalRecord.name}\` ${change.originalRecord.type} record\n` +
                `  From: \`${change.originalRecord.value}\`\n` +
                `  To:   \`${change.newRecord.value}\``
              );
            }
            break;
            
          case 'ADD':
            if (change.record) {
              sections.added.push(
                `• \`${change.record.name}\` ${change.record.type} record\n` +
                `  Value: \`${change.record.value}\``
              );
            }
            break;
        }
      } catch (error) {
        console.error('Error formatting change:', error, change);
      }
    });

    const parts: string[] = [];
    
    if (sections.added.length > 0) {
      parts.push(
        `🟢 **Added Records**\n${sections.added.join('\n\n')}`
      );
    }
    
    if (sections.modified.length > 0) {
      parts.push(
        `🟡 **Modified Records**\n${sections.modified.join('\n\n')}`
      );
    }
    
    if (sections.deleted.length > 0) {
      parts.push(
        `🔴 **Deleted Records**\n${sections.deleted.join('\n\n')}`
      );
    }

    return parts.join('\n\n');
  }

  private formatMessage(zone: string, changesSummary: string, timestamp: number): string {
    const timeString = new Date(timestamp).toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `## 🔄 DNS Changes Applied

### Zone: \`${zone}\`
**Time:** ${timeString}

${changesSummary}

---
📋 [View Zone Records](${window.location.origin}/zones)`;
  }

  async testWebhook(): Promise<boolean> {
    try {
      const testPayload: WebhookPayload = {
        text: `## 🧪 DNS Manager Test Notification

### Connection Test Successful! 
If you see this message, your webhook integration is working correctly.

#### Configuration Details:
• **Provider:** ${this.webhookProvider}
• **Time:** ${new Date().toLocaleString()}

---
This is a test message sent from the DNS Manager application.`,
        username: 'DNS Manager',
        icon_emoji: ':test_tube:'
      };

      await this.sendWebhook(testPayload);
      return true;
    } catch (error) {
      console.error('Test webhook failed:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService(); 