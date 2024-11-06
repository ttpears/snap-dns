class NotificationService {
  constructor() {
    this.webhookUrl = null;
  }

  setWebhookUrl(url) {
    this.webhookUrl = url;
  }

  async sendNotification(zone, changes) {
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
      const message = this.formatMattermostMessage(zone, changesSummary, timestamp);

      console.log('Sending notification:', {
        zone,
        changesCount: changes.length,
        webhookUrl: this.webhookUrl
      });

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

      console.log('Notification sent successfully');
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
      throw error; // Re-throw to handle in the calling component
    }
  }

  formatChangesSummary(changes) {
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
            if (!change.record) {
              return `- Deleted: <incomplete record>`;
            }
            return `- Deleted: ${change.record.name} ${change.record.type} ${change.record.value}`;
            
          case 'MODIFY':
            if (!change.originalRecord || !change.newRecord) {
              return `- Modified: <incomplete record>`;
            }
            return `- Modified: ${change.originalRecord.name} ${change.originalRecord.type}
    From: ${change.originalRecord.value}
    To: ${change.newRecord.value}`;
            
          case 'ADD':
            if (!change.name || !change.recordType || !change.value) {
              return `- Added: <incomplete record>`;
            }
            return `- Added: ${change.name} ${change.recordType} ${change.value}`;
            
          default:
            return `- Unknown change type: ${change.type}`;
        }
      } catch (error) {
        console.error('Error formatting change:', error, change);
        return '- Error formatting change';
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
    if (!this.webhookUrl) {
      console.log('No webhook URL configured, skipping backup notification');
      return;
    }

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
      console.error('Failed to send backup notification:', error);
    }
  }
}

export const notificationService = new NotificationService(); 