// src/services/tokenService.ts
// Frontend service for managing personal API tokens stored server-side.
// Mirrors tsigKeyService: session-cookie auth via credentials:'include'.
import { getApiUrl } from '../utils/apiUrl';

const API_URL = getApiUrl();

// Metadata for an existing token (never includes the raw token or its hash).
export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

// Result of creating a token; the raw `token` is shown exactly once.
export interface CreatedToken {
  token: string;
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
}

class TokenService {
  /**
   * List the caller's own, non-revoked tokens (metadata only).
   */
  async listTokens(): Promise<ApiToken[]> {
    try {
      const response = await fetch(`${API_URL}/api/tokens`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to fetch API tokens');
      }

      const data = await response.json();
      return data.tokens || [];
    } catch (error) {
      console.error('List API tokens error:', error);
      throw error;
    }
  }

  /**
   * Create a new API token. The returned raw token is displayed once and
   * never persisted anywhere by the client.
   */
  async createToken(name: string, expiresInDays?: number): Promise<CreatedToken> {
    try {
      const body: { name: string; expiresInDays?: number } = { name };
      if (typeof expiresInDays === 'number') {
        body.expiresInDays = expiresInDays;
      }

      const response = await fetch(`${API_URL}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to create API token');
      }

      return await response.json();
    } catch (error) {
      console.error('Create API token error:', error);
      throw error;
    }
  }

  /**
   * Revoke (delete) one of the caller's own tokens.
   */
  async revokeToken(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/api/tokens/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to revoke API token');
      }
    } catch (error) {
      console.error('Revoke API token error:', error);
      throw error;
    }
  }
}

export const tokenService = new TokenService();
