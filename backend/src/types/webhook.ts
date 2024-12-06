export type WebhookProvider = 'slack' | 'discord' | 'teams' | 'mattermost';

export interface WebhookConfig {
  provider: string;
  url: string;
}

export interface WebhookPayload {
  text: string;
  title?: string;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
  color?: string;
  channel?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
}

export interface WebhookResponse {
  success: boolean;
  error?: string;
  details?: string;
} 