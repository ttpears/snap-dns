// backend/src/services/backupService.ts
// Server-side backup storage and management

import { promises as fs } from 'fs';
import path from 'path';

const BACKUPS_DIR = path.join(process.cwd(), 'data', 'backups');
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
  recordCount: number;
  type: 'auto' | 'manual';
  description?: string;
  version: string;
  createdBy: string;
}

class BackupService {
  private initialized = false;

  /**
   * Initialize the service - create backups directory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(BACKUPS_DIR, { recursive: true });
      console.log(`Backup directory initialized: ${BACKUPS_DIR}`);
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
    return path.join(BACKUPS_DIR, `${sanitizedZone}.json`);
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
        records,
        type: options.type,
        description: options.description,
        version: '1.0',
        createdBy: userId,
      };

      // Load existing backups
      const filePath = this.getZoneBackupFile(zone);
      let backups: DNSBackup[] = [];

      try {
        const data = await fs.readFile(filePath, 'utf-8');
        backups = JSON.parse(data);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Add new backup at the beginning
      backups.unshift(backup);

      // Maintain max backups limit
      if (backups.length > MAX_BACKUPS_PER_ZONE) {
        backups = backups.slice(0, MAX_BACKUPS_PER_ZONE);
      }

      // Save to file
      await fs.writeFile(filePath, JSON.stringify(backups, null, 2), 'utf-8');

      console.log(`Backup created for zone ${zone}: ${backup.id} by user ${userId}`);
      return backup;
    } catch (error) {
      console.error(`Failed to create backup for zone ${zone}:`, error);
      throw error;
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

      // Save updated list
      await fs.writeFile(filePath, JSON.stringify(backups, null, 2), 'utf-8');

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
      const files = await fs.readdir(BACKUPS_DIR);
      const allBackups: BackupListItem[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(BACKUPS_DIR, file);
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
