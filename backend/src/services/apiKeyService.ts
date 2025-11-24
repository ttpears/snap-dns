// backend/src/services/apiKeyService.ts
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { ApiKey, ApiKeyCreateData, ApiKeyResponse, ApiKeyCreateResponse, ValidatedApiKey } from '../types/apiKey';

const SALT_ROUNDS = 12;
const API_KEYS_FILE = path.join(process.cwd(), 'data', 'api-keys.json');
const KEY_PREFIX = 'snap_';

class ApiKeyService {
  private keys: Map<string, ApiKey> = new Map();
  private initialized = false;
  private initializing = false;

  /**
   * Initialize the API key service and load keys from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Prevent concurrent initialization
    if (this.initializing) {
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.initializing = true;

    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(API_KEYS_FILE), { recursive: true });

      // Try to load existing keys
      try {
        const data = await fs.readFile(API_KEYS_FILE, 'utf-8');
        const keysArray: ApiKey[] = JSON.parse(data);

        // Convert dates from strings
        keysArray.forEach(key => {
          key.createdAt = new Date(key.createdAt);
          if (key.lastUsedAt) {
            key.lastUsedAt = new Date(key.lastUsedAt);
          }
          if (key.expiresAt) {
            key.expiresAt = new Date(key.expiresAt);
          }
          this.keys.set(key.id, key);
        });

        console.log(`Loaded ${this.keys.size} API keys from disk`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log('No existing API keys file, starting fresh');
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize API key service:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Save keys to disk
   */
  private async saveKeys(): Promise<void> {
    const keysArray = Array.from(this.keys.values());
    await fs.writeFile(API_KEYS_FILE, JSON.stringify(keysArray, null, 2), 'utf-8');
  }

  /**
   * Generate a unique API key ID
   */
  private generateKeyId(): string {
    return `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate a secure random API key
   * Format: snap_<base64url-encoded-24-bytes>
   */
  private generateApiKey(): string {
    const randomBytes = crypto.randomBytes(24);
    const base64url = randomBytes.toString('base64url');
    return `${KEY_PREFIX}${base64url}`;
  }

  /**
   * Create a new API key for a user
   */
  async createApiKey(userId: string, data: ApiKeyCreateData): Promise<ApiKeyCreateResponse> {
    await this.initialize();

    // Generate the plain API key
    const plainKey = this.generateApiKey();

    // Hash the key
    const keyHash = await bcrypt.hash(plainKey, SALT_ROUNDS);

    // Calculate expiration date
    let expiresAt: Date | undefined;
    if (data.expiresInDays && data.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
    }

    // Create the key record
    const apiKey: ApiKey = {
      id: this.generateKeyId(),
      userId,
      name: data.name,
      keyHash,
      scopes: data.scopes,
      createdAt: new Date(),
      expiresAt
    };

    // Save to memory and disk
    this.keys.set(apiKey.id, apiKey);
    await this.saveKeys();

    console.log(`Created API key "${data.name}" for user ${userId}`);

    // Return the plain key (only time it's ever visible)
    return {
      key: plainKey,
      metadata: this.toResponse(apiKey, plainKey)
    };
  }

  /**
   * Validate an API key and return associated data
   */
  async validateApiKey(plainKey: string): Promise<ValidatedApiKey | null> {
    await this.initialize();

    // Check key format
    if (!plainKey.startsWith(KEY_PREFIX)) {
      return null;
    }

    // Try to find and validate the key
    for (const apiKey of this.keys.values()) {
      // Check if key matches
      const isValid = await bcrypt.compare(plainKey, apiKey.keyHash);
      if (!isValid) continue;

      // Check if key is expired
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        console.warn(`API key ${apiKey.id} is expired`);
        return null;
      }

      // Update last used timestamp (async, don't wait)
      this.updateLastUsed(apiKey.id).catch(err => {
        console.error('Failed to update lastUsedAt:', err);
      });

      // We need to get user data - import userService here to avoid circular dependency
      const { userService } = await import('./userService');
      const user = await userService.getUserById(apiKey.userId);

      if (!user) {
        console.error(`User ${apiKey.userId} not found for API key ${apiKey.id}`);
        return null;
      }

      return {
        key: apiKey,
        userId: user.id,
        username: user.username,
        role: user.role,
        allowedKeyIds: user.allowedKeyIds
      };
    }

    return null;
  }

  /**
   * Update the lastUsedAt timestamp for a key
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (!key) return;

    key.lastUsedAt = new Date();
    await this.saveKeys();
  }

  /**
   * List all API keys for a user
   */
  async listUserKeys(userId: string): Promise<ApiKeyResponse[]> {
    await this.initialize();

    const userKeys = Array.from(this.keys.values())
      .filter(key => key.userId === userId);

    return userKeys.map(key => this.toResponse(key));
  }

  /**
   * Delete an API key
   * Returns true if deleted, false if not found or not owned by user
   */
  async deleteApiKey(keyId: string, userId: string): Promise<boolean> {
    await this.initialize();

    const key = this.keys.get(keyId);
    if (!key || key.userId !== userId) {
      return false;
    }

    this.keys.delete(keyId);
    await this.saveKeys();

    console.log(`Deleted API key ${keyId} for user ${userId}`);
    return true;
  }

  /**
   * Rotate an API key (generate new key value, keep same metadata)
   */
  async rotateApiKey(keyId: string, userId: string): Promise<ApiKeyCreateResponse | null> {
    await this.initialize();

    const key = this.keys.get(keyId);
    if (!key || key.userId !== userId) {
      return null;
    }

    // Generate new key and hash it
    const plainKey = this.generateApiKey();
    const keyHash = await bcrypt.hash(plainKey, SALT_ROUNDS);

    // Update the key hash
    key.keyHash = keyHash;
    key.lastUsedAt = undefined; // Reset last used
    await this.saveKeys();

    console.log(`Rotated API key ${keyId} for user ${userId}`);

    return {
      key: plainKey,
      metadata: this.toResponse(key, plainKey)
    };
  }

  /**
   * Get a specific API key by ID
   */
  async getKeyById(keyId: string): Promise<ApiKey | null> {
    await this.initialize();
    return this.keys.get(keyId) || null;
  }

  /**
   * Clean up expired API keys
   * Should be called periodically
   */
  async cleanupExpiredKeys(): Promise<number> {
    await this.initialize();

    const now = new Date();
    let deletedCount = 0;

    for (const [keyId, key] of this.keys.entries()) {
      if (key.expiresAt && key.expiresAt < now) {
        this.keys.delete(keyId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await this.saveKeys();
      console.log(`Cleaned up ${deletedCount} expired API keys`);
    }

    return deletedCount;
  }

  /**
   * Convert ApiKey to ApiKeyResponse (without keyHash)
   */
  private toResponse(key: ApiKey, plainKey?: string): ApiKeyResponse {
    return {
      id: key.id,
      name: key.name,
      scopes: key.scopes,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      keyPreview: plainKey ? `${plainKey.substring(0, 12)}...` : `${KEY_PREFIX}...`
    };
  }
}

// Export singleton instance
export const apiKeyService = new ApiKeyService();
