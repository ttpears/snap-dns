import { WebhookConfig, WebhookPayload, WebhookProvider, WebhookResponse } from '../types/webhook';

class WebhookService {
  private formatPayload(provider: WebhookProvider, payload: WebhookPayload): any {
    switch (provider) {
      case 'slack':
        return {
          text: payload.text,
          username: payload.username,
          icon_emoji: payload.icon_emoji,
          attachments: payload.title ? [{
            title: payload.title,
            color: payload.color,
            fields: payload.fields
          }] : undefined
        };

      case 'discord':
        return {
          content: payload.text,
          username: payload.username,
          avatar_url: payload.icon_url,
          embeds: payload.title ? [{
            title: payload.title,
            color: payload.color ? parseInt(payload.color.replace('#', ''), 16) : undefined,
            fields: payload.fields?.map(f => ({
              name: f.title,
              value: f.value,
              inline: f.short
            }))
          }] : undefined
        };

      case 'teams':
        return {
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          summary: payload.title || payload.text,
          themeColor: payload.color,
          title: payload.title,
          text: payload.text,
          sections: payload.fields?.length ? [{
            facts: payload.fields.map(f => ({
              name: f.title,
              value: f.value
            }))
          }] : undefined
        };

      case 'mattermost':
      default:
        // Keep existing Mattermost format for backward compatibility
        return {
          text: payload.text,
          username: payload.username,
          icon_emoji: payload.icon_emoji,
          icon_url: payload.icon_url
        };
    }
  }

  async send(config: WebhookConfig, payload: WebhookPayload): Promise<WebhookResponse> {
    try {
      const formattedPayload = this.formatPayload(config.provider, payload);

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formattedPayload)
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with status: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`${config.provider} webhook error:`, error);
      return {
        success: false,
        error: 'Failed to send webhook notification',
        details: (error as Error).message
      };
    }
  }
}

export const webhookService = new WebhookService(); 