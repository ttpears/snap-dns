export interface Config {
  keys: Key[];
  defaultTTL?: number;
  webhookUrl?: string | null;
  webhookProvider?: WebhookProvider;
  rowsPerPage?: number;
}

export function validateConfig(config: any): config is Config {
  return (
    typeof config === 'object' &&
    Array.isArray(config.keys) &&
    (config.defaultTTL === undefined || typeof config.defaultTTL === 'number') &&
    (config.webhookUrl === undefined || config.webhookUrl === null || typeof config.webhookUrl === 'string') &&
    (config.webhookProvider === undefined || config.webhookProvider === null || typeof config.webhookProvider === 'string') &&
    (config.rowsPerPage === undefined || typeof config.rowsPerPage === 'number')
  );
} 