// backend/src/services/backupService.ts
// Server-side backup storage and management

import { promises as fs } from 'fs';
import path from 'path';
import { BackupConfig, resolveBackupConfig } from '../config/backups';
import { writeJsonAtomic, removeFileLocked } from '../utils/atomicJson';

const MAX_BACKUPS_PER_ZONE = 50;

export interface DNSRecord {
  name: string;
  type: string;
  value: string | any;
  ttl: number;
  class?: string;
}

export interface DNSBackup {
  id: string;
  timestamp: number;
  zone: string;
  server: string;
  // TSIG key/view this snapshot was taken through. Optional for backward
  // compatibility with snapshots created before split-view support.
  keyId?: string;
  records: DNSRecord[];
  type: 'auto' | 'manual';
  description?: string;
  version: string;
  createdBy: string; // User ID who created the backup
}

export interface BackupListItem {
  id: string;
  timestamp: number;
  zone: string;
  server: string;
  keyId?: string;
  recordCount: number;
  type: 'auto' | 'manual';
  description?: string;
  version: string;
  createdBy: string;
}

export class BackupService {
  private initialized = false;
  private readonly dir: string;
  private readonly maxTotalBytes: number;

  constructor(cfg: BackupConfig = resolveBackupConfig()) {
    this.dir = cfg.dir;
    this.maxTotalBytes = cfg.maxTotalBytes;
  }

  /**
   * Initialize the service - create backups directory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.dir, { recursive: true });
      console.log(`Backup directory initialized: ${this.dir}`);
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize backup service:', error);
      throw error;
    }
  }

  /**
   * Get backup file path for a specific zone
   */
  private getZoneBackupFile(zone: string): string {
    // Sanitize zone name for filename
    const sanitizedZone = zone.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.dir, `${sanitizedZone}.json`);
  }

  /**
   * Load backups for a specific zone
   */
  async getBackupsForZone(zone: string, userId: string, userRole: string): Promise<BackupListItem[]> {
    if (!this.initialized) await this.initialize();

    try {
      const filePath = this.getZoneBackupFile(zone);

      try {
        const data = await fs.readFile(filePath, 'utf-8');
        const backups: DNSBackup[] = JSON.parse(data);

        // Filter by user access (admins see all, others see only their own)
        const filteredBackups = userRole === 'admin'
          ? backups
          : backups.filter(b => b.createdBy === userId);

        // Return list items (without full records for performance)
        return filteredBackups.map(b => ({
          id: b.id,
          timestamp: b.timestamp,
          zone: b.zone,
          server: b.server,
          keyId: b.keyId,
          recordCount: b.records.length,
          type: b.type,
          description: b.description,
          version: b.version,
          createdBy: b.createdBy,
        }));
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    } catch (error) {
      console.error(`Failed to get backups for zone ${zone}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific backup by ID
   */
  async getBackup(zone: string, backupId: string, userId: string, userRole: string): Promise<DNSBackup | null> {
    if (!this.initialized) await this.initialize();

    try {
      const filePath = this.getZoneBackupFile(zone);
      const data = await fs.readFile(filePath, 'utf-8');
      const backups: DNSBackup[] = JSON.parse(data);

      const backup = backups.find(b => b.id === backupId);

      if (!backup) return null;

      // Check access permissions
      if (userRole !== 'admin' && backup.createdBy !== userId) {
        throw new Error('Access denied to this backup');
      }

      return backup;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new backup
   */
  async createBackup(
    zone: string,
    records: DNSRecord[],
    userId: string,
    options: {
      server: string;
      keyId?: string;
      type: 'auto' | 'manual';
      description?: string;
    }
  ): Promise<DNSBackup> {
    if (!this.initialized) await this.initialize();

    try {
      const backup: DNSBackup = {
        id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        zone,
        server: options.server,
        keyId: options.keyId,
        records,
        type: options.type,
        description: options.description,
        version: '1.0',
        createdBy: userId,
      };

      // A snapshot that alone exceeds the whole budget can never be stored;
      // reject it rather than evict everything else and still overflow.
      const soloBytes = this.fileBytes([backup]);
      if (soloBytes > this.maxTotalBytes) {
        throw new Error(
          `Snapshot (${soloBytes} bytes) exceeds the total backup size budget of ${this.maxTotalBytes} bytes`
        );
      }

      // Work over the whole store in memory so eviction can pick the globally
      // oldest snapshot regardless of which zone it lives in.
      const files = await this.loadAllFiles();
      const targetFile = this.getZoneBackupFile(zone);
      const targetArr = files.get(targetFile) ?? [];
      targetArr.unshift(backup);
      if (targetArr.length > MAX_BACKUPS_PER_ZONE) {
        targetArr.length = MAX_BACKUPS_PER_ZONE;
      }
      files.set(targetFile, targetArr);

      const changed = new Set<string>([targetFile]);
      this.evictToBudget(files, backup.id, changed);
      await this.persistFiles(files, changed);

      console.log(`Backup created for zone ${zone}: ${backup.id} by user ${userId}`);
      return backup;
    } catch (error) {
      console.error(`Failed to create backup for zone ${zone}:`, error);
      throw error;
    }
  }

  /** Serialized byte size of a zone's backup array as written to disk. */
  private fileBytes(backups: DNSBackup[]): number {
    if (backups.length === 0) return 0;
    return Buffer.byteLength(JSON.stringify(backups, null, 2), 'utf-8');
  }

  /** Load every zone backup file into memory, keyed by absolute file path. */
  private async loadAllFiles(): Promise<Map<string, DNSBackup[]>> {
    const files = new Map<string, DNSBackup[]>();
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch (error: any) {
      if (error.code === 'ENOENT') return files;
      throw error;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const filePath = path.join(this.dir, name);
      const data = await fs.readFile(filePath, 'utf-8');
      files.set(filePath, JSON.parse(data));
    }
    return files;
  }

  /**
   * Evict the globally-oldest snapshots (by timestamp, across all zones) until the
   * total serialized size is within budget. The just-created snapshot (`keepId`)
   * is never evicted; since its solo size is guaranteed <= budget, the loop always
   * terminates under budget. Mutates `files` and records touched paths in `changed`.
   */
  private evictToBudget(files: Map<string, DNSBackup[]>, keepId: string, changed: Set<string>): void {
    const sizes = new Map<string, number>();
    let total = 0;
    for (const [file, arr] of files) {
      const bytes = this.fileBytes(arr);
      sizes.set(file, bytes);
      total += bytes;
    }
    if (total <= this.maxTotalBytes) return;

    // Oldest-first across every zone, excluding the snapshot we must keep.
    const candidates: { file: string; id: string; timestamp: number }[] = [];
    for (const [file, arr] of files) {
      for (const b of arr) {
        if (b.id !== keepId) candidates.push({ file, id: b.id, timestamp: b.timestamp });
      }
    }
    candidates.sort((a, b) => a.timestamp - b.timestamp);

    for (const c of candidates) {
      if (total <= this.maxTotalBytes) break;
      const arr = files.get(c.file);
      if (!arr) continue;
      const idx = arr.findIndex(b => b.id === c.id);
      if (idx === -1) continue;
      arr.splice(idx, 1);
      const newBytes = this.fileBytes(arr);
      total += newBytes - (sizes.get(c.file) ?? 0);
      sizes.set(c.file, newBytes);
      changed.add(c.file);
    }
  }

  /**
   * Write changed zone files; remove any that were emptied by eviction. Each
   * write is atomic (temp file + rename) and each file's write/remove is
   * serialized against other writers of that same path, so a crash cannot
   * truncate a zone file and a concurrent createBackup for another zone cannot
   * clobber this one. Distinct files still persist concurrently.
   */
  private async persistFiles(files: Map<string, DNSBackup[]>, changed: Set<string>): Promise<void> {
    for (const file of changed) {
      const arr = files.get(file) ?? [];
      if (arr.length === 0) {
        await removeFileLocked(file);
      } else {
        await writeJsonAtomic(file, arr);
      }
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(zone: string, backupId: string, userId: string, userRole: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const filePath = this.getZoneBackupFile(zone);
      const data = await fs.readFile(filePath, 'utf-8');
      let backups: DNSBackup[] = JSON.parse(data);

      const backupToDelete = backups.find(b => b.id === backupId);

      if (!backupToDelete) {
        throw new Error('Backup not found');
      }

      // Check access permissions (only admins or creators can delete)
      if (userRole !== 'admin' && backupToDelete.createdBy !== userId) {
        throw new Error('Access denied to delete this backup');
      }

      // Remove the backup
      backups = backups.filter(b => b.id !== backupId);

      // Save updated list atomically and serialized against other writers.
      await writeJsonAtomic(filePath, backups);

      console.log(`Backup deleted: ${backupId} from zone ${zone} by user ${userId}`);
    } catch (error) {
      console.error(`Failed to delete backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Get all backups across all zones (admin only)
   */
  async getAllBackups(userId: string, userRole: string): Promise<BackupListItem[]> {
    if (!this.initialized) await this.initialize();

    try {
      const files = await fs.readdir(this.dir);
      const allBackups: BackupListItem[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.dir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const backups: DNSBackup[] = JSON.parse(data);

        // Filter by user access
        const filteredBackups = userRole === 'admin'
          ? backups
          : backups.filter(b => b.createdBy === userId);

        allBackups.push(...filteredBackups.map(b => ({
          id: b.id,
          timestamp: b.timestamp,
          zone: b.zone,
          server: b.server,
          keyId: b.keyId,
          recordCount: b.records.length,
          type: b.type,
          description: b.description,
          version: b.version,
          createdBy: b.createdBy,
        })));
      }

      // Sort by timestamp descending
      allBackups.sort((a, b) => b.timestamp - a.timestamp);

      return allBackups;
    } catch (error) {
      console.error('Failed to get all backups:', error);
      throw error;
    }
  }
}

export const backupService = new BackupService();
