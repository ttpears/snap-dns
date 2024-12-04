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
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const config = localStorage.getItem('dns_manager_config');
      if (config) {
        const parsedConfig = JSON.parse(config);
        if (parsedConfig.webhookUrl) {
          this.webhookUrl = parsedConfig.webhookUrl;
          this.webhookProvider = parsedConfig.webhookProvider || 'mattermost';
          console.log('Loaded webhook configuration:', {
            url: this.webhookUrl,
            provider: this.webhookProvider
          });
        }
      }
    } catch (error) {
      console.error('Error loading webhook configuration:', error);
    }
  }

  syncWithConfig() {
    this.loadConfig();
  }

  setWebhookConfig(url: string, provider: WebhookProvider = 'mattermost') {
    this.webhookUrl = url;
    this.webhookProvider = provider;
    console.log('Updated webhook configuration:', {
      url: this.webhookUrl,
      provider: this.webhookProvider
    });
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

  async sendNotification(zone: string, changes: any) {
    if (!this.webhookUrl) {
      console.log('No webhook URL configured, skipping notification');
      return;
    }

    try {
      console.log('Processing notification:', { zone, changes });

      // If no changes array is provided, return early
      if (!changes || (!Array.isArray(changes.changes) && !Array.isArray(changes))) {
        console.log('No changes to notify about');
        return;
      }

      const timestamp = Date.now();
      const changesSummary = this.formatChangesSummary(
        Array.isArray(changes.changes) ? changes.changes : changes
      );

      // Skip if no changes were formatted
      if (!changesSummary) {
        console.log('No formatted changes to notify about');
        return;
      }

      const message = this.formatMessage(zone, changes, timestamp);

      console.log('Sending notification:', {
        zone,
        changesCount: Array.isArray(changes.changes) ? changes.changes.length : changes.length,
        webhookUrl: this.webhookUrl,
        provider: this.webhookProvider,
        message
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
              let deleteDesc = '';
              switch (change.record.type) {
                case 'A':
                  deleteDesc = `Removed IP address \`${change.record.value}\` from \`${change.record.name}\``;
                  break;
                case 'CNAME':
                  deleteDesc = `Removed alias \`${change.record.name}\` pointing to \`${change.record.value}\``;
                  break;
                case 'MX':
                  deleteDesc = `Removed mail server entry \`${change.record.value}\` from \`${change.record.name}\``;
                  break;
                case 'TXT':
                  deleteDesc = `Removed text record from \`${change.record.name}\``;
                  break;
                default:
                  deleteDesc = `Removed ${change.record.type} record \`${change.record.name}\` with value \`${change.record.value}\``;
              }
              sections.deleted.push(deleteDesc);
            }
            break;
            
          case 'MODIFY':
            if (change.originalRecord && change.newRecord) {
              let modifyDesc = '';
              switch (change.originalRecord.type) {
                case 'A':
                  modifyDesc = `Updated IP address for \`${change.originalRecord.name}\`\n` +
                             `  From: \`${change.originalRecord.value}\`\n` +
                             `  To:   \`${change.newRecord.value}\``;
                  break;
                case 'CNAME':
                  modifyDesc = `Updated alias \`${change.originalRecord.name}\`\n` +
                             `  From pointing to: \`${change.originalRecord.value}\`\n` +
                             `  To pointing to:   \`${change.newRecord.value}\``;
                  break;
                case 'MX':
                  modifyDesc = `Updated mail server settings for \`${change.originalRecord.name}\`\n` +
                             `  From: \`${change.originalRecord.value}\`\n` +
                             `  To:   \`${change.newRecord.value}\``;
                  break;
                case 'TXT':
                  modifyDesc = `Updated text record for \`${change.originalRecord.name}\``;
                  break;
                default:
                  modifyDesc = `Updated ${change.originalRecord.type} record \`${change.originalRecord.name}\`\n` +
                             `  From: \`${change.originalRecord.value}\`\n` +
                             `  To:   \`${change.newRecord.value}\``;
              }
              if (change.originalRecord.ttl !== change.newRecord.ttl) {
                modifyDesc += `\n  TTL changed from ${change.originalRecord.ttl}s to ${change.newRecord.ttl}s`;
              }
              sections.modified.push(modifyDesc);
            }
            break;
            
          case 'ADD':
            if (change.record) {
              let addDesc = '';
              switch (change.record.type) {
                case 'A':
                  addDesc = `Added IP address \`${change.record.value}\` for \`${change.record.name}\``;
                  break;
                case 'CNAME':
                  addDesc = `Created alias \`${change.record.name}\` pointing to \`${change.record.value}\``;
                  break;
                case 'MX':
                  addDesc = `Added mail server \`${change.record.value}\` for \`${change.record.name}\``;
                  break;
                case 'TXT':
                  addDesc = `Added text record to \`${change.record.name}\``;
                  break;
                default:
                  addDesc = `Added ${change.record.type} record \`${change.record.name}\` with value \`${change.record.value}\``;
              }
              sections.added.push(addDesc);
            }
            break;
            
          case 'RESTORE':
            if (change.record) {
              let restoreDesc = '';
              switch (change.record.type) {
                case 'A':
                  restoreDesc = `Restored IP address \`${change.record.value}\` for \`${change.record.name}\``;
                  break;
                case 'CNAME':
                  restoreDesc = `Restored alias \`${change.record.name}\` pointing to \`${change.record.value}\``;
                  break;
                case 'MX':
                  restoreDesc = `Restored mail server \`${change.record.value}\` for \`${change.record.name}\``;
                  break;
                case 'TXT':
                  restoreDesc = `Restored text record for \`${change.record.name}\``;
                  break;
                default:
                  restoreDesc = `Restored ${change.record.type} record \`${change.record.name}\` with value \`${change.record.value}\``;
              }
              sections.added.push(restoreDesc);
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
        `🟢 **Added**\n${sections.added.join('\n')}`
      );
    }
    
    if (sections.modified.length > 0) {
      parts.push(
        `🟡 **Modified**\n${sections.modified.join('\n\n')}`
      );
    }
    
    if (sections.deleted.length > 0) {
      parts.push(
        `🔴 **Deleted**\n${sections.deleted.join('\n')}`
      );
    }

    return parts.join('\n\n');
  }

  private formatMessage(zone: string, changes: any, timestamp: number): string {
    const timeString = new Date(timestamp).toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    if (Array.isArray(changes.zones)) {
      return `## 🔄 DNS Changes Summary

### Affected Zones: ${changes.zones.map((z: string) => `\`${z}\``).join(', ')}
**Time:** ${timeString}
**Total Changes:** ${changes.totalChanges}

${this.formatChangesSummary(changes.changes)}`;
    }

    return `## 🔄 DNS Changes Applied

### Zone: \`${zone}\`
**Time:** ${timeString}

${this.formatChangesSummary(changes)}`;
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

window.addEventListener('storage', () => {
  notificationService.syncWithConfig();
});

document.addEventListener('DOMContentLoaded', () => {
  notificationService.syncWithConfig();
}); 