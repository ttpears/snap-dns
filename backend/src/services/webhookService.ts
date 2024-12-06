import { WebhookConfig, WebhookResponse } from '../types/webhook';
import type { WebhookPayload as ImportedWebhookPayload } from '../types/webhook';
import fetch from 'node-fetch';

export type WebhookPayload = ImportedWebhookPayload;

class WebhookService {
  private formatPayload(provider: string, payload: WebhookPayload): any {
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
        return {
          text: payload.text,
          username: payload.username,
          icon_emoji: payload.icon_emoji,
          icon_url: payload.icon_url,
          channel: payload.channel
        };
    }
  }

  async send(config: WebhookConfig, payload: WebhookPayload): Promise<WebhookResponse> {
    try {
      const formattedPayload = this.formatPayload(config.provider, payload);

      console.log('Sending webhook request:', {
        url: config.url,
        provider: config.provider,
        payload: formattedPayload
      });

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formattedPayload)
      });

      let responseText;
      try {
        responseText = await response.text();
      } catch (e) {
        responseText = 'No response body';
      }

      if (!response.ok) {
        console.error('Webhook request failed:', {
          status: response.status,
          response: responseText
        });
        return {
          success: false,
          error: 'Webhook request failed',
          details: `Status ${response.status}: ${responseText}`
        };
      }

      return { success: true };
    } catch (error) {
      console.error(`${config.provider} webhook error:`, error);
      return {
        success: false,
        error: 'Failed to send webhook notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const webhookService = new WebhookService(); 