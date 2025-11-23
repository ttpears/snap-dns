// src/services/authService.ts
// Authentication service for frontend

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';
console.log('AuthService initialized with API_URL:', API_URL);

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  email?: string;
  allowedKeyIds: string[];
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user?: User;
}

class AuthService {
  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important: sends cookies
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Login failed',
        };
      }

      return data;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Failed to connect to server',
      };
    }
  }

  /**
   * Logout and destroy session
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Check current session status
   */
  async checkSession(): Promise<SessionResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        method: 'GET',
        credentials: 'include',
      });

      return await response.json();
    } catch (error) {
      console.error('Session check error:', error);
      return { authenticated: false };
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to change password',
        };
      }

      return data;
    } catch (error) {
      console.error('Change password error:', error);
      return {
        success: false,
        error: 'Failed to connect to server',
      };
    }
  }
}

export const authService = new AuthService();
