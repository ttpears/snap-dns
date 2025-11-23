import { WebhookConfig, WebhookResponse } from '../types/webhook';
import type { WebhookPayload as ImportedWebhookPayload } from '../types/webhook';
import fetch from 'node-fetch';

export type WebhookPayload = ImportedWebhookPayload;

class WebhookService {
  /**
   * Format payload as Microsoft Teams Adaptive Card
   * Following design guidelines from:
   * https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/design-effective-cards
   */
  private formatAdaptiveCard(payload: WebhookPayload): any {
    const card: any = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          body: [],
          actions: []
        }
      }]
    };

    const body = card.attachments[0].content.body;
    const actions = card.attachments[0].content.actions;

    // === HERO HEADER ===
    // Design principle: Clear visual hierarchy with accent container
    if (payload.title) {
      body.push({
        type: 'Container',
        style: 'emphasis',
        bleed: true,
        items: [{
          type: 'ColumnSet',
          columns: [
            {
              type: 'Column',
              width: 'auto',
              items: [{
                type: 'TextBlock',
                text: this.getIconForTitle(payload.title),
                size: 'extraLarge',
                spacing: 'none'
              }],
              spacing: 'small'
            },
            {
              type: 'Column',
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: payload.title,
                  weight: 'bolder',
                  size: 'large',
                  wrap: true,
                  spacing: 'none'
                },
                {
                  type: 'TextBlock',
                  text: new Date().toLocaleString(),
                  size: 'small',
                  color: 'accent',
                  wrap: true,
                  spacing: 'small'
                }
              ],
              spacing: 'medium',
              verticalContentAlignment: 'center'
            }
          ]
        }]
      });
    }

    // === MAIN CONTENT ===
    // Design principle: Keep body copy readable with proper wrapping
    if (payload.text) {
      body.push({
        type: 'TextBlock',
        text: payload.text,
        wrap: true,
        spacing: 'medium'
      });
    }

    // === STRUCTURED DATA ===
    // Design principle: Use ColumnSets for tabular data, mobile-friendly
    if (payload.fields && payload.fields.length > 0) {
      // Group fields for better mobile display (max 2 columns)
      const fieldPairs = [];
      for (let i = 0; i < payload.fields.length; i += 2) {
        fieldPairs.push(payload.fields.slice(i, i + 2));
      }

      body.push({
        type: 'Container',
        spacing: 'medium',
        separator: true,
        items: fieldPairs.map(pair => ({
          type: 'ColumnSet',
          columns: pair.map(field => ({
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: field.title,
                weight: 'bolder',
                size: 'small',
                color: 'accent',
                wrap: true,
                spacing: 'none'
              },
              {
                type: 'TextBlock',
                text: field.value,
                wrap: true,
                spacing: 'small'
              }
            ],
            spacing: 'medium'
          }))
        }))
      });
    }

    // === FOOTER ===
    // Design principle: Subtle footer with sender info
    body.push({
      type: 'Container',
      separator: true,
      spacing: 'medium',
      items: [{
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'auto',
            items: [{
              type: 'TextBlock',
              text: '🤖',
              spacing: 'none'
            }]
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [{
              type: 'TextBlock',
              text: payload.username || 'Snap DNS Manager',
              size: 'small',
              weight: 'lighter',
              wrap: true,
              spacing: 'none'
            }],
            spacing: 'small',
            verticalContentAlignment: 'center'
          }
        ]
      }]
    });

    // === ACTIONS ===
    // Design principle: Limit to 1-3 clear actions
    // Add contextual action button if we have zone information
    if (payload.fields) {
      const zoneField = payload.fields.find(f => f.title.toLowerCase().includes('zone'));
      if (zoneField) {
        actions.push({
          type: 'Action.OpenUrl',
          title: 'View Zone Details',
          url: `https://snap-dns-testing.teamgleim.com/zones?zone=${encodeURIComponent(zoneField.value)}`,
          style: 'positive'
        });
      }
    }

    return card;
  }

  /**
   * Get appropriate emoji icon based on notification title
   */
  private getIconForTitle(title: string): string {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('backup') || lowerTitle.includes('snapshot')) return '💾';
    if (lowerTitle.includes('added') || lowerTitle.includes('create')) return '✅';
    if (lowerTitle.includes('deleted') || lowerTitle.includes('remove')) return '🗑️';
    if (lowerTitle.includes('modified') || lowerTitle.includes('update')) return '✏️';
    if (lowerTitle.includes('error') || lowerTitle.includes('fail')) return '❌';
    if (lowerTitle.includes('warning')) return '⚠️';
    if (lowerTitle.includes('success')) return '🎉';

    return '📝'; // Default for DNS changes
  }

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
        // Use Adaptive Cards format for Microsoft Teams
        return this.formatAdaptiveCard(payload);

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