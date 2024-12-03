export type WebhookProvider = 'mattermost' | 'slack' | 'discord' | 'teams' | 'generic' | null | undefined;

export interface WebhookConfig {
  provider: Exclude<WebhookProvider, null | undefined>;
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
  channel?: string;
}

export interface WebhookResponse {
  success: boolean;
  error?: string;
  details?: string;
} 