class NotificationService {
  constructor() {
    this.webhookUrl = null;
  }

  setWebhookUrl(url) {
    this.webhookUrl = url;
  }

  async sendNotification(zone, changes) {
    if (!this.webhookUrl) return;

    try {
      const timestamp = Date.now();
      const changesSummary = this.formatChangesSummary(changes);
      const message = this.formatMattermostMessage(zone, changesSummary, timestamp);

      const payload = {
        text: message,
        username: 'DNS Manager',
        icon_emoji: ':pencil:'
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }

  formatChangesSummary(changes) {
    return changes.map(change => {
      console.log('Formatting change:', change);
      
      switch (change.type) {
        case 'DELETE':
          return `- Deleted: ${change.record.name} ${change.record.type} ${change.record.value}`;
        case 'MODIFY':
          return `- Modified: ${change.originalRecord.name} ${change.originalRecord.type}
  From: ${change.originalRecord.value}
  To: ${change.newRecord.value}`;
        case 'ADD':
          return `- Added: ${change.name} ${change.recordType} ${change.value}`;
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