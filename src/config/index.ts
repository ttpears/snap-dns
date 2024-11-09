interface KeyConfig {
  id: string;
  name: string;
  server: string;
  keyName: string;
  keyValue: string;
  algorithm: string;
  zones?: string[];
}

interface Config {
  defaultServer: string;
  keys: KeyConfig[];
  defaultTTL?: number;
  webhookUrl?: string;
}

// Default config that will be overridden by ConfigContext
const config: Config = {
  defaultServer: '',
  keys: [],
  defaultTTL: 3600
};

export { config };
export type { Config, KeyConfig }; 