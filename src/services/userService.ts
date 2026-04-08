// src/services/userService.ts
import { getApiUrl } from '../utils/apiUrl';
const API_URL = getApiUrl();

export interface UserResponse {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  email?: string;
  lastLogin?: Date;
  allowedKeyIds: string[];
  allowedZones: string[];
}

export interface UserCreateData {
  username: string;
  password: string;
  role: 'admin' | 'editor' | 'viewer';
  email?: string;
  allowedKeyIds?: string[];
  allowedZones?: string[];
}

class UserService {
  /**
   * List all users (admin only)
   */
  async listUsers(): Promise<UserResponse[]> {
    const response = await fetch(`${API_URL}/api/auth/users`, {
      credentials: 'include',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to list users');
    }

    return data.users;
  }

  /**
   * Create a new user (admin only)
   */
  async createUser(userData: UserCreateData): Promise<UserResponse> {
    const response = await fetch(`${API_URL}/api/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(userData),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to create user');
    }

    return data.user;
  }

  /**
   * Delete a user (admin only)
   */
  async deleteUser(userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to delete user');
    }
  }

  /**
   * Update user role (admin only)
   */
  async updateUserRole(userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update user role');
    }
  }

  /**
   * Update user's allowed keys (admin only)
   */
  async updateUserKeys(userId: string, keyIds: string[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}/keys`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ keyIds }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update user keys');
    }
  }

  /**
   * Update user's allowed zones (admin only)
   */
  async updateUserZones(userId: string, zones: string[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}/zones`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ zones }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update user zones');
    }
  }

  /**
   * Reset user password (admin only)
   */
  async resetPassword(userId: string, newPassword: string, currentPassword?: string): Promise<void> {
    const body: Record<string, string> = { newPassword };
    if (currentPassword) {
      body.currentPassword = currentPassword;
    }

    const response = await fetch(`${API_URL}/api/auth/users/${userId}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to reset password');
    }
  }
}

export const userService = new UserService();
