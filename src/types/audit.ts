// src/types/audit.ts
// Frontend types for audit logging

export enum AuditEventType {
  // Authentication events
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  PASSWORD_CHANGE = 'auth.password_change',
  PASSWORD_RESET = 'auth.password_reset',

  // User management
  USER_CREATED = 'user.created',
  USER_DELETED = 'user.deleted',
  USER_UPDATED = 'user.updated',

  // TSIG key management
  KEY_CREATED = 'tsig.created',
  KEY_UPDATED = 'tsig.updated',
  KEY_DELETED = 'tsig.deleted',
  KEY_ACCESSED = 'tsig.accessed',

  // DNS operations
  RECORD_ADDED = 'dns.record.added',
  RECORD_DELETED = 'dns.record.deleted',
  RECORD_UPDATED = 'dns.record.updated',
  ZONE_QUERIED = 'dns.zone.queried',

  // Security events
  UNAUTHORIZED_ACCESS = 'security.unauthorized',
  VALIDATION_FAILURE = 'security.validation_failure',
  RATE_LIMIT_EXCEEDED = 'security.rate_limit',
}

export interface AuditEntry {
  timestamp: string;
  eventType: AuditEventType;
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  details?: any;
  error?: string;
}

export interface AuditQueryFilters {
  eventType?: AuditEventType;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface EventTypesResponse {
  authentication: AuditEventType[];
  userManagement: AuditEventType[];
  tsigKeys: AuditEventType[];
  dns: AuditEventType[];
  security: AuditEventType[];
}
