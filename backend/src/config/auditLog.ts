// backend/src/config/auditLog.ts
// Single place that resolves audit-log rotation settings from the environment.
//
// The audit log (data/audit.log) is append-only and would otherwise grow
// without bound, eventually filling the disk on a long-running deployment.
// These knobs drive a size-based rotation ring in auditService:
//   - AUDIT_LOG_MAX_SIZE_MB  max size of the active log before it is rotated
//                            (default 10 MB)
//   - AUDIT_LOG_MAX_FILES    number of rotated files kept (audit.log.1 ..
//                            audit.log.N); the oldest is deleted (default 5)
//   - AUDIT_LOG_FILE         active log path (default data/audit.log under cwd)

import path from 'path';

export interface AuditLogConfig {
  /** Absolute (or cwd-relative) path of the active audit log file. */
  filePath: string;
  /** Rotate once the active file would exceed this many bytes. */
  maxSizeBytes: number;
  /** Number of rotated files to keep (audit.log.1 .. audit.log.N). */
  maxFiles: number;
}

const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_MAX_FILES = 5;

/**
 * Parse a strictly-positive integer env var, falling back to `fallback` for
 * unset, empty, non-numeric, or non-positive values.
 */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Resolve the audit-log rotation configuration from the given environment
 * (defaults to process.env). Resolved in one place so both the service and
 * tests agree on the knobs and their defaults.
 */
export function resolveAuditLogConfig(env: NodeJS.ProcessEnv = process.env): AuditLogConfig {
  const maxSizeMb = parsePositiveInt(env.AUDIT_LOG_MAX_SIZE_MB, DEFAULT_MAX_SIZE_MB);
  const maxFiles = parsePositiveInt(env.AUDIT_LOG_MAX_FILES, DEFAULT_MAX_FILES);
  const filePath = env.AUDIT_LOG_FILE || path.join(process.cwd(), 'data', 'audit.log');

  return {
    filePath,
    maxSizeBytes: maxSizeMb * 1024 * 1024,
    maxFiles,
  };
}
