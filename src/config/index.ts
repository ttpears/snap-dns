// src/config/index.ts
interface Config {
  defaultServer: string;
  defaultTTL?: number;
  webhookUrl?: string;
}

// Default config that will be overridden by ConfigContext
const config: Config = {
  defaultServer: '',
  defaultTTL: 3600
};

export { config };
export type { Config };
