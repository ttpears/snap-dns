// backend/src/services/auditService.ts
// Audit logging for DNS operations and security events

import { promises as fs } from 'fs';
import path from 'path';

const AUDIT_LOG_FILE = path.join(process.cwd(), 'data', 'audit.log');

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

  // API key management
  API_KEY_CREATED = 'apikey.created',
  API_KEY_DELETED = 'apikey.deleted',
  API_KEY_ROTATED = 'apikey.rotated',
  API_KEY_USED = 'apikey.used',

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
  /** API key ID if request was authenticated via API key */
  apiKeyId?: string;
}

class AuditService {
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Log an audit event
   */
  async log(
    eventType: AuditEventType,
    data: {
      userId?: string;
      username?: string;
      ipAddress?: string;
      userAgent?: string;
      success: boolean;
      details?: any;
      error?: string;
      apiKeyId?: string;
    }
  ): Promise<void> {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      ...data,
    };

    // Queue the write to prevent race conditions
    this.writeQueue = this.writeQueue.then(() => this.writeEntry(entry));

    // Also log to console for immediate visibility
    const logLevel = data.success ? 'info' : 'warn';
    const message = `[AUDIT] ${eventType} | User: ${data.username || 'unknown'} | Success: ${data.success}`;

    if (logLevel === 'info') {
      console.log(message, data.details ? `| Details: ${JSON.stringify(data.details)}` : '');
    } else {
      console.warn(message, data.error ? `| Error: ${data.error}` : '');
    }
  }

  /**
   * Write a single audit entry to file
   */
  private async writeEntry(entry: AuditEntry): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(AUDIT_LOG_FILE), { recursive: true });

      // Append to log file (one JSON object per line for easy parsing)
      await fs.appendFile(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Don't throw - audit logging shouldn't break the app
    }
  }

  /**
   * Query audit logs (basic implementation)
   */
  async query(filters?: {
    eventType?: AuditEventType;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(AUDIT_LOG_FILE, 'utf-8');
      let entries = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as AuditEntry);

      // Apply filters
      if (filters) {
        if (filters.eventType) {
          entries = entries.filter(e => e.eventType === filters.eventType);
        }
        if (filters.userId) {
          entries = entries.filter(e => e.userId === filters.userId);
        }
        if (filters.startDate) {
          entries = entries.filter(e => new Date(e.timestamp) >= filters.startDate!);
        }
        if (filters.endDate) {
          entries = entries.filter(e => new Date(e.timestamp) <= filters.endDate!);
        }
        if (filters.limit) {
          entries = entries.slice(-filters.limit);
        }
      }

      return entries.reverse(); // Most recent first
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // No log file yet
      }
      console.error('Failed to query audit logs:', error);
      throw error;
    }
  }

  /**
   * Log a DNS operation
   */
  async logDNSOperation(
    operation: 'add' | 'delete' | 'update' | 'query',
    zone: string,
    record: any,
    userId: string,
    username: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const eventTypeMap = {
      add: AuditEventType.RECORD_ADDED,
      delete: AuditEventType.RECORD_DELETED,
      update: AuditEventType.RECORD_UPDATED,
      query: AuditEventType.ZONE_QUERIED,
    };

    await this.log(eventTypeMap[operation], {
      userId,
      username,
      success,
      details: {
        zone,
        record: {
          name: record.name,
          type: record.type,
          // Don't log full values for security (especially TXT records)
          valueLength: typeof record.value === 'string' ? record.value.length : 0,
        },
      },
      error,
    });
  }

  /**
   * Log authentication events
   */
  async logAuth(
    eventType: AuditEventType.LOGIN_SUCCESS | AuditEventType.LOGIN_FAILURE | AuditEventType.LOGOUT,
    username: string,
    userId?: string,
    ipAddress?: string,
    success: boolean = true,
    error?: string
  ): Promise<void> {
    await this.log(eventType, {
      userId,
      username,
      ipAddress,
      success,
      error,
    });
  }
}

export const auditService = new AuditService();
