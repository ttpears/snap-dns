// backend/src/types/auth.ts
import { Request } from 'express';

// User role for authorization
export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer'
}

// User interface
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  email?: string;
  createdAt: Date;
  lastLogin?: Date;
  // Array of key IDs this user has access to
  allowedKeyIds: string[];
}

// User creation data (without hash)
export interface UserCreateData {
  username: string;
  password: string;
  role: UserRole;
  email?: string;
  allowedKeyIds?: string[];
}

// User response (without sensitive data)
export interface UserResponse {
  id: string;
  username: string;
  role: UserRole;
  email?: string;
  lastLogin?: Date;
  allowedKeyIds: string[];
}

// Session data stored in express-session
export interface SessionData {
  userId: string;
  username: string;
  role: UserRole;
  allowedKeyIds: string[];
}

// Extend Express Request to include session data
declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
    role: UserRole;
    allowedKeyIds: string[];
  }
}

// Authenticated request type
export interface AuthenticatedRequest extends Request {
  user?: SessionData;
}

// Login credentials
export interface LoginCredentials {
  username: string;
  password: string;
}

// Permission check result
export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}
