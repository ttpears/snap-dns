// shared-types/webhook.ts
// Shared webhook type definitions

// Webhook provider types
export type WebhookProvider = 'mattermost' | 'slack' | 'discord' | 'teams' | 'generic' | null | undefined;

// Webhook configuration
export interface WebhookConfig {
  provider: Exclude<WebhookProvider, null | undefined>;
  url: string;
  name?: string;
  icon?: string;
  channel?: string;
}

// Webhook payload structure (compatible with multiple providers)
export interface WebhookPayload {
  text: string;
  title?: string;
  color?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
  channel?: string;
}

// Webhook response
export interface WebhookResponse {
  success: boolean;
  error?: string;
  details?: string;
}
