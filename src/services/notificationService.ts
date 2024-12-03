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

    const endpoint = `${this.apiUrl}/webhook/${this.webhookProvider}`;
    console.log('Sending webhook to:', endpoint, {
      webhookUrl: this.webhookUrl,
      provider: this.webhookProvider,
      payload
    });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl: this.webhookUrl,
          payload
        })
      });

      let responseData;
      const textResponse = await response.text();
      try {
        responseData = JSON.parse(textResponse);
      } catch (e) {
        console.error('Failed to parse response as JSON:', textResponse);
        throw new Error('Invalid JSON response from server');
      }

      console.log('Webhook response:', {
        status: response.status,
        ok: response.ok,
        data: responseData
      });

      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
      }

      return responseData;
    } catch (error) {
      console.error('Webhook error details:', {
        error,
        apiUrl: this.apiUrl,
        provider: this.webhookProvider,
        endpoint: `${this.apiUrl}/webhook/${this.webhookProvider}`
      });
      throw error;
    }
  }

  private formatChangesSummary(changes: any[]): string {
    if (!Array.isArray(changes)) {
      console.error('Changes must be an array:', changes);
      return 'Invalid changes format';
    }

    return changes.map(change => {
      if (!change || !change.type) {
        console.error('Invalid change object:', change);
        return '- Invalid change entry';
      }

      try {
        switch (change.type) {
          case 'DELETE':
            return change.record
              ? `- Deleted: ${change.record.name} ${change.record.type} ${change.record.value}`
              : `- Deleted: <incomplete record>`;
            
          case 'MODIFY':
            return change.originalRecord && change.newRecord
              ? `- Modified: ${change.originalRecord.name} ${change.originalRecord.type}\n    From: ${change.originalRecord.value}\n    To: ${change.newRecord.value}`
              : `- Modified: <incomplete record>`;
            
          case 'ADD':
            return change.name && change.recordType && change.value
              ? `- Added: ${change.name} ${change.recordType} ${change.value}`
              : `- Added: <incomplete record>`;
            
          default:
            return `- Unknown change type: ${change.type}`;
        }
      } catch (error) {
        console.error('Error formatting change:', error, change);
        return '- Error formatting change';
      }
    }).join('\n');
  }

  private formatMessage(zone: string, changesSummary: string, timestamp: number): string {
    return `### DNS Changes Applied - ${zone}
**Time:** ${new Date(timestamp).toLocaleString()}

**Changes:**
\`\`\`
${changesSummary}
\`\`\`

[View Zone Records](${window.location.origin}/zones)`;
  }

  async testWebhook(): Promise<boolean> {
    try {
      const testPayload: WebhookPayload = {
        text: '### DNS Manager Test Notification\nIf you see this message, webhooks are working correctly!',
        username: 'DNS Manager Test',
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