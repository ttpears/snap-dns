// backend/src/config/backups.ts
// Single place that resolves server-side snapshot (backup) storage settings from
// the environment.
//
// Snapshots (data/backups/<zone>.json) embed a full copy of a zone's records and
// would otherwise grow without bound across zones, eventually filling the disk on
// a long-running deployment. These knobs drive a global size budget in
// backupService (oldest snapshots are evicted first once the budget is exceeded):
//   - BACKUP_MAX_TOTAL_SIZE_MB  total budget for the whole backups directory
//                               (default 512 MB)
//   - BACKUP_DIR                backups directory (default data/backups under cwd)

import path from 'path';

export interface BackupConfig {
  /** Directory holding the per-zone backup files. */
  dir: string;
  /** Total on-disk budget for all backups, in bytes. */
  maxTotalBytes: number;
}

const DEFAULT_MAX_TOTAL_MB = 512;

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
 * Resolve the backup storage configuration from the given environment (defaults
 * to process.env). Resolved in one place so both the service and tests agree on
 * the knobs and their defaults.
 */
export function resolveBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  const maxTotalMb = parsePositiveInt(env.BACKUP_MAX_TOTAL_SIZE_MB, DEFAULT_MAX_TOTAL_MB);
  const dir = env.BACKUP_DIR || path.join(process.cwd(), 'data', 'backups');

  return {
    dir,
    maxTotalBytes: maxTotalMb * 1024 * 1024,
  };
}
