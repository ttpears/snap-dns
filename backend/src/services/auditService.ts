// backend/src/services/auditService.ts
// Audit logging for DNS operations and security events

import { promises as fs } from 'fs';
import path from 'path';
import { AuditLogConfig, resolveAuditLogConfig } from '../config/auditLog';

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

  // API token management
  TOKEN_CREATED = 'token.created',
  TOKEN_REVOKED = 'token.revoked',
  TOKEN_AUTH_FAILED = 'token.auth.failed',

  // DNS operations
  RECORD_ADDED = 'dns.record.added',
  RECORD_DELETED = 'dns.record.deleted',
  RECORD_UPDATED = 'dns.record.updated',
  ZONE_QUERIED = 'dns.zone.queried',

  // Snapshot (server-side zone backup) lifecycle
  SNAPSHOT_CREATED = 'snapshot.created',
  SNAPSHOT_DELETED = 'snapshot.deleted',

  // Server-side configuration changes
  WEBHOOK_CONFIG_UPDATED = 'config.webhook.updated',
  WEBHOOK_CONFIG_DELETED = 'config.webhook.deleted',
  SSO_CONFIG_UPDATED = 'config.sso.updated',

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

class AuditService {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath: string;
  private readonly maxSizeBytes: number;
  private readonly maxFiles: number;

  constructor(cfg: AuditLogConfig = resolveAuditLogConfig()) {
    this.filePath = cfg.filePath;
    this.maxSizeBytes = cfg.maxSizeBytes;
    this.maxFiles = cfg.maxFiles;
  }

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
   * Write a single audit entry to file.
   *
   * Called sequentially through the write queue (see log()), so the
   * check-and-rotate below never races another writer. When the active file
   * plus the incoming line would exceed the size cap, the rotation ring is
   * shifted first and the entry is then appended to a fresh, empty file. The
   * append itself is a single atomic appendFile call, so an entry is never
   * split or lost.
   */
  private async writeEntry(entry: AuditEntry): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });

      // One JSON object per line for easy parsing
      const line = JSON.stringify(entry) + '\n';
      const lineBytes = Buffer.byteLength(line, 'utf-8');

      // Rotate before appending so the active file stays under the cap and the
      // entry lands in a fresh file rather than pushing an oversized one.
      await this.rotateIfNeeded(lineBytes);

      // Append is a single atomic call -- the entry is written whole or not at all.
      await fs.appendFile(this.filePath, line, 'utf-8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Don't throw - audit logging shouldn't break the app
    }
  }

  /**
   * Rotate the log ring if appending `incomingBytes` would push the active file
   * past the size cap. Shifts audit.log.(N-1) -> audit.log.N (dropping the
   * oldest), then audit.log -> audit.log.1, leaving audit.log absent so the
   * caller appends to a fresh file. No-op on first run (no file yet).
   */
  private async rotateIfNeeded(incomingBytes: number): Promise<void> {
    let currentSize: number;
    try {
      currentSize = (await fs.stat(this.filePath)).size;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return; // First run: nothing to rotate.
      }
      throw error;
    }

    // Nothing to rotate if empty, or if the entry still fits under the cap.
    if (currentSize === 0 || currentSize + incomingBytes <= this.maxSizeBytes) {
      return;
    }

    // Shift the ring from oldest to newest. Renaming .(i) -> .(i+1) overwrites
    // the destination, so the file at .maxFiles is dropped, keeping at most
    // maxFiles rotated files.
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      await this.safeRename(`${this.filePath}.${i}`, `${this.filePath}.${i + 1}`);
    }
    await this.safeRename(this.filePath, `${this.filePath}.1`);
  }

  /**
   * Rename that tolerates a missing source (a rotated slot that does not exist
   * yet). Any other error propagates to writeEntry's catch.
   */
  private async safeRename(from: string, to: string): Promise<void> {
    try {
      await fs.rename(from, to);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Query audit logs, returning matching entries newest-first.
   *
   * Rotation means the most recent entries can span the active file plus one or
   * more rotated files (audit.log.1, audit.log.2, ...). The files are strictly
   * ordered by recency (active newest, then .1, .2, ...), so this reads them
   * newest-first and stops as soon as the requested limit is satisfied -- small
   * limits never touch older rotated files.
   */
  async query(filters?: {
    eventType?: AuditEventType;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditEntry[]> {
    const limit = filters?.limit;
    const collected: AuditEntry[] = []; // Accumulated newest-first.

    // Newest file first: active log, then rotated files .1 .. .maxFiles.
    for (const filePath of this.orderedFilePaths()) {
      const fileEntries = await this.readFilteredEntries(filePath, filters);
      // Lines are appended oldest-first within a file; reverse to newest-first.
      for (let i = fileEntries.length - 1; i >= 0; i--) {
        collected.push(fileEntries[i]);
      }
      if (limit && limit > 0 && collected.length >= limit) {
        break; // Have enough newest entries; older files can't add newer ones.
      }
    }

    if (limit && limit > 0 && collected.length > limit) {
      return collected.slice(0, limit);
    }
    return collected;
  }

  /**
   * File paths ordered newest-first: the active log followed by rotated files
   * audit.log.1 .. audit.log.maxFiles.
   */
  private orderedFilePaths(): string[] {
    const paths = [this.filePath];
    for (let i = 1; i <= this.maxFiles; i++) {
      paths.push(`${this.filePath}.${i}`);
    }
    return paths;
  }

  /**
   * Read one log file and return its entries (oldest-first, as stored) after
   * applying the given filters. Returns [] if the file does not exist.
   */
  private async readFilteredEntries(
    filePath: string,
    filters?: {
      eventType?: AuditEventType;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<AuditEntry[]> {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // Rotated slot not present (or no log yet).
      }
      console.error('Failed to read audit log file:', error);
      throw error;
    }

    let entries = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as AuditEntry);

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
    }

    return entries;
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
    success = true,
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

export { AuditService };
export const auditService = new AuditService();
