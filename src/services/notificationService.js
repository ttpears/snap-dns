class NotificationService {
  constructor() {
    this.webhookUrl = null;
  }

  setWebhookUrl(url) {
    this.webhookUrl = url;
  }

  async sendNotification(changes, zone) {
    if (!this.webhookUrl) {
      console.log('No webhook URL configured, skipping notification');
      return;
    }

    try {
      // Format changes into a readable message
      const changesSummary = this.formatChangesSummary(changes);
      const timestamp = new Date().toISOString();

      const payload = {
        text: this.formatMattermostMessage(zone, changesSummary, timestamp),
        username: 'DNS Manager',
        icon_emoji: ':dns:'
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook notification failed: ${response.statusText}`);
      }

      console.log('Webhook notification sent successfully');
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
      // Don't throw the error - we don't want to interrupt DNS operations
      // if notifications fail
    }
  }

  formatChangesSummary(changes) {
    return changes.map(change => {
      switch (change.type) {
        case 'DELETE':
          return `- Deleted: ${change.originalRecord.name} ${change.originalRecord.type} ${change.originalRecord.value}`;
        case 'MODIFY':
          return `- Modified: ${change.originalRecord.name} ${change.originalRecord.type}\n  From: ${change.originalRecord.value}\n  To: ${change.newRecord.value}`;
        case 'ADD':
          return `- Added: ${change.newRecord.name} ${change.newRecord.type} ${change.newRecord.value}`;
        default:
          return `- Unknown change type: ${change.type}`;
      }
    }).join('\n');
  }

  formatMattermostMessage(zone, changesSummary, timestamp) {
    return `### DNS Changes Applied - ${zone}
**Time:** ${new Date(timestamp).toLocaleString()}

**Changes:**
\`\`\`
${changesSummary}
\`\`\`

[View Zone Records](${window.location.origin}/zones)`;
  }

  async notifyBackupCreated(backup) {
    if (!this.webhookUrl) return;

    try {
      const payload = {
        text: `### DNS Backup Created
**Zone:** ${backup.zone}
**Type:** ${backup.type}
**Time:** ${new Date(backup.timestamp).toLocaleString()}
**Records:** ${backup.records.length}`,
        username: 'DNS Manager',
        icon_emoji: ':floppy_disk:'
      };

      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send backup notification:', error);
    }
  }

  async notifyRestoreCompleted(zone, recordCount) {
    if (!this.webhookUrl) return;

    try {
      const payload = {
        text: `### DNS Records Restored
**Zone:** ${zone}
**Records Restored:** ${recordCount}
**Time:** ${new Date().toLocaleString()}`,
        username: 'DNS Manager',
        icon_emoji: ':arrows_counterclockwise:'
      };

      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send restore notification:', error);
    }
  }
}

export const notificationService = new NotificationService(); 