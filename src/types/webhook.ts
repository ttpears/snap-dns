export type WebhookProvider = 'mattermost' | 'slack' | 'discord' | 'teams' | 'generic';

export interface WebhookConfig {
  provider: WebhookProvider;
  url: string;
  name?: string;
  icon?: string;
  channel?: string;
}

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
}

export interface WebhookResponse {
  success: boolean;
  error?: string;
  details?: string;
} 