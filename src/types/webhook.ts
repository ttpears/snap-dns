// src/types/webhook.ts
export type WebhookProvider = 'mattermost' | 'slack' | 'discord' | 'teams' | 'generic' | null | undefined;

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
