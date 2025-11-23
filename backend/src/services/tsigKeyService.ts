// backend/src/services/tsigKeyService.ts
// Server-side TSIG key storage and management

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const KEYS_FILE = path.join(process.cwd(), 'data', 'tsig-keys.json');

// Encryption key for storing TSIG keys (should be from env in production)
const ENCRYPTION_KEY = process.env.TSIG_ENCRYPTION_KEY || 'change-this-32-char-key-in-prod!';
const ALGORITHM = 'aes-256-cbc';

export interface TSIGKey {
  id: string;
  name: string;
  server: string;
  keyName: string;
  keyValue: string; // Encrypted
  algorithm: string;
  zones: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // User ID
}

export interface TSIGKeyCreate {
  name: string;
  server: string;
  keyName: string;
  keyValue: string;
  algorithm: string;
  zones?: string[];
}

export interface TSIGKeyResponse {
  id: string;
  name: string;
  server: string;
  keyName: string;
  algorithm: string;
  zones: string[];
  createdAt: Date;
  updatedAt: Date;
}

class TSIGKeyService {
  private keys: Map<string, TSIGKey> = new Map();
  private initialized = false;

  /**
   * Encrypt TSIG key value
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt TSIG key value
   */
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];

    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });

      try {
        const data = await fs.readFile(KEYS_FILE, 'utf-8');
        const keysArray: TSIGKey[] = JSON.parse(data);

        keysArray.forEach(key => {
          key.createdAt = new Date(key.createdAt);
          key.updatedAt = new Date(key.updatedAt);
          this.keys.set(key.id, key);
        });

        console.log(`Loaded ${this.keys.size} TSIG keys from disk`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log('No existing TSIG keys file');
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize TSIG key service:', error);
      throw error;
    }
  }

  /**
   * Save keys to disk
   */
  private async saveKeys(): Promise<void> {
    const keysArray = Array.from(this.keys.values());
    await fs.writeFile(KEYS_FILE, JSON.stringify(keysArray, null, 2), 'utf-8');
  }

  /**
   * Create a new TSIG key
   */
  async createKey(userId: string, keyData: TSIGKeyCreate): Promise<TSIGKeyResponse> {
    if (!this.initialized) await this.initialize();

    // Encrypt the key value before storage
    const encryptedValue = this.encrypt(keyData.keyValue);

    const key: TSIGKey = {
      id: this.generateKeyId(),
      name: keyData.name,
      server: keyData.server,
      keyName: keyData.keyName,
      keyValue: encryptedValue,
      algorithm: keyData.algorithm,
      zones: keyData.zones || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId,
    };

    this.keys.set(key.id, key);
    await this.saveKeys();

    console.log(`TSIG key created: ${key.name} (${key.id}) by user ${userId}`);
    return this.toKeyResponse(key);
  }

  /**
   * Get a key by ID with decrypted value
   */
  async getKey(keyId: string): Promise<TSIGKey | null> {
    if (!this.initialized) await this.initialize();

    const key = this.keys.get(keyId);
    if (!key) return null;

    // Return a copy with decrypted key value
    return {
      ...key,
      keyValue: this.decrypt(key.keyValue),
    };
  }

  /**
   * Get key for a specific zone
   */
  async getKeyForZone(zone: string, userId: string, allowedKeyIds: string[]): Promise<TSIGKey | null> {
    if (!this.initialized) await this.initialize();

    // Find a key that matches the zone and user has access to
    for (const key of this.keys.values()) {
      // Check if user has access to this key
      if (!allowedKeyIds.includes(key.id)) continue;

      // Check if key is configured for this zone
      if (key.zones.length === 0 || key.zones.includes(zone)) {
        return {
          ...key,
          keyValue: this.decrypt(key.keyValue),
        };
      }
    }

    return null;
  }

  /**
   * List all keys (without decrypted values)
   */
  async listKeys(userId?: string, allowedKeyIds?: string[]): Promise<TSIGKeyResponse[]> {
    if (!this.initialized) await this.initialize();

    let keysArray = Array.from(this.keys.values());

    // Filter by allowed keys if provided
    if (allowedKeyIds && allowedKeyIds.length > 0) {
      keysArray = keysArray.filter(k => allowedKeyIds.includes(k.id));
    }

    return keysArray.map(k => this.toKeyResponse(k));
  }

  /**
   * Update a key
   */
  async updateKey(keyId: string, updates: Partial<TSIGKeyCreate>): Promise<TSIGKeyResponse> {
    if (!this.initialized) await this.initialize();

    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error('Key not found');
    }

    // Update fields
    if (updates.name) key.name = updates.name;
    if (updates.server) key.server = updates.server;
    if (updates.keyName) key.keyName = updates.keyName;
    if (updates.algorithm) key.algorithm = updates.algorithm;
    if (updates.zones) key.zones = updates.zones;

    // Re-encrypt if keyValue changed
    if (updates.keyValue) {
      key.keyValue = this.encrypt(updates.keyValue);
    }

    key.updatedAt = new Date();

    await this.saveKeys();
    console.log(`TSIG key updated: ${key.name} (${key.id})`);

    return this.toKeyResponse(key);
  }

  /**
   * Delete a key
   */
  async deleteKey(keyId: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (!this.keys.has(keyId)) {
      throw new Error('Key not found');
    }

    this.keys.delete(keyId);
    await this.saveKeys();
    console.log(`TSIG key deleted: ${keyId}`);
  }

  /**
   * Convert TSIGKey to response (without encrypted value)
   */
  private toKeyResponse(key: TSIGKey): TSIGKeyResponse {
    return {
      id: key.id,
      name: key.name,
      server: key.server,
      keyName: key.keyName,
      algorithm: key.algorithm,
      zones: key.zones,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  /**
   * Generate unique key ID
   */
  private generateKeyId(): string {
    return `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

export const tsigKeyService = new TSIGKeyService();
