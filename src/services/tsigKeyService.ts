// src/services/tsigKeyService.ts
// Frontend service for managing TSIG keys stored server-side

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

export interface TSIGKey {
  id: string;
  name: string;
  server: string;
  keyName: string;
  algorithm: string;
  zones: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TSIGKeyCreate {
  name: string;
  server: string;
  keyName: string;
  keyValue: string;
  algorithm: string;
  zones?: string[];
}

class TSIGKeyService {
  /**
   * List all TSIG keys
   */
  async listKeys(): Promise<TSIGKey[]> {
    try {
      const response = await fetch(`${API_URL}/api/tsig-keys`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch TSIG keys');
      }

      const data = await response.json();
      return data.keys || [];
    } catch (error) {
      console.error('List TSIG keys error:', error);
      throw error;
    }
  }

  /**
   * Create a new TSIG key
   */
  async createKey(keyData: TSIGKeyCreate): Promise<TSIGKey> {
    try {
      const response = await fetch(`${API_URL}/api/tsig-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(keyData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create TSIG key');
      }

      const data = await response.json();
      return data.key;
    } catch (error) {
      console.error('Create TSIG key error:', error);
      throw error;
    }
  }

  /**
   * Update a TSIG key
   */
  async updateKey(keyId: string, updates: Partial<TSIGKeyCreate>): Promise<TSIGKey> {
    try {
      const response = await fetch(`${API_URL}/api/tsig-keys/${keyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update TSIG key');
      }

      const data = await response.json();
      return data.key;
    } catch (error) {
      console.error('Update TSIG key error:', error);
      throw error;
    }
  }

  /**
   * Delete a TSIG key
   */
  async deleteKey(keyId: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/api/tsig-keys/${keyId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete TSIG key');
      }
    } catch (error) {
      console.error('Delete TSIG key error:', error);
      throw error;
    }
  }
}

export const tsigKeyService = new TSIGKeyService();
