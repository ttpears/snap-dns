export interface Key {
  id: string;
  name: string;
  algorithm: string;
  secret: string;
  server: string;
  zones: string[];
  created?: number;
}

export interface KeyConfig {
  id: string;
  name: string;
  algorithm: string;
  secret: string;
  server: string;
  zones: string[];
  created: number;
} 