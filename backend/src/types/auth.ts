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
  // Array of zone names this user is restricted to (empty = no restriction)
  allowedZones: string[];
  // When true, the user must change their password before performing any
  // mutating action. Set for the seeded default admin and for accounts whose
  // password was set/reset by an administrator. Optional so SSO users (which
  // have no local password) and legacy on-disk records omit it entirely.
  mustChangePassword?: boolean;
}

// User creation data (without hash)
export interface UserCreateData {
  username: string;
  password: string;
  role: UserRole;
  email?: string;
  allowedKeyIds?: string[];
  allowedZones?: string[];
}

// User response (without sensitive data)
export interface UserResponse {
  id: string;
  username: string;
  role: UserRole;
  email?: string;
  lastLogin?: Date;
  allowedKeyIds: string[];
  allowedZones: string[];
}

// Session data stored in express-session
export interface SessionData {
  userId: string;
  username: string;
  role: UserRole;
  allowedKeyIds: string[];
  allowedZones: string[];
  // Mirrors User.mustChangePassword so /session can surface it and the
  // requirePasswordCurrent guard can read it off the request.
  mustChangePassword?: boolean;
}

// Extend Express Request to include session data
declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
    role: UserRole;
    allowedKeyIds: string[];
    allowedZones: string[];
    mustChangePassword?: boolean;
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
