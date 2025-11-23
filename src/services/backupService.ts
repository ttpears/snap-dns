import { notificationService } from './notificationService';
import { dnsService, type DNSRecord } from './dnsService';
import type { Config, KeyConfig } from '../config';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

interface DNSBackup {
  id: string;
  timestamp: number;
  zone: string;
  server: string;
  records: DNSRecord[];
  type: 'auto' | 'manual';
  description?: string;
  version: string;
  createdBy?: string;
}

interface BackupListItem {
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

interface BackupOptions {
  type: 'auto' | 'manual';
  description?: string;
  server?: string;
  config: Config;
}

export class BackupService {
  private readonly VERSION = '1.0';

  /**
   * Get all backups (list items only, without full records)
   */
  async getBackups(): Promise<BackupListItem[]> {
    try {
      const response = await fetch(`${API_URL}/api/backups`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch backups');
      }

      const data = await response.json();
      return data.backups || [];
    } catch (error) {
      console.error('Failed to get backups:', error);
      throw error;
    }
  }

  /**
   * Get backups for a specific zone
   */
  async getBackupsForZone(zone: string): Promise<BackupListItem[]> {
    try {
      const response = await fetch(`${API_URL}/api/backups/zone/${encodeURIComponent(zone)}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch backups for zone');
      }

      const data = await response.json();
      return data.backups || [];
    } catch (error) {
      console.error(`Failed to get backups for zone ${zone}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific backup with full records
   */
  async getBackup(zone: string, backupId: string): Promise<DNSBackup> {
    try {
      const response = await fetch(`${API_URL}/api/backups/zone/${encodeURIComponent(zone)}/${backupId}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch backup');
      }

      const data = await response.json();
      return data.backup;
    } catch (error) {
      console.error(`Failed to get backup ${backupId}:`, error);
      throw error;
    }
  }

  async createBackup(zone: string, records: DNSRecord[], options: BackupOptions): Promise<DNSBackup> {
    try {
      const response = await fetch(`${API_URL}/api/backups/zone/${encodeURIComponent(zone)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          records,
          server: options.server || options.config.defaultServer,
          type: options.type,
          description: options.description,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create backup');
      }

      const data = await response.json();
      const newBackup = data.backup;

      if (options.type === 'manual') {
        await notificationService.notifyBackupCreated(newBackup);
      }

      return newBackup;
    } catch (error: unknown) {
      console.error('Failed to create backup:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to create backup: ${error.message}`);
      }
      throw new Error('Failed to create backup: Unknown error');
    }
  }

  async restoreRecords(backup: DNSBackup, config: Config, selectedRecords?: DNSRecord[]): Promise<void> {
    try {
      const recordsToRestore = selectedRecords || backup.records;

      // Keys are now handled server-side, no need for keyConfig
      for (const record of recordsToRestore) {
        await dnsService.addRecord(backup.zone, record);
      }
    } catch (error: unknown) {
      console.error('Failed to restore records:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to restore records: ${error.message}`);
      }
      throw new Error('Failed to restore records: Unknown error');
    }
  }

  downloadBackup(backup: DNSBackup): void {
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { 
        type: 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backup.zone}-backup-${new Date(backup.timestamp).toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: unknown) {
      console.error('Failed to download backup:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to download backup: ${error.message}`);
      }
      throw new Error('Failed to download backup: Unknown error');
    }
  }

  async importBackup(file: File): Promise<DNSBackup> {
    try {
      const content = await file.text();
      const backup = JSON.parse(content);

      // Validate backup structure
      if (!this.isValidBackup(backup)) {
        throw new Error('Invalid backup format');
      }

      // Import by creating a new backup on the server
      const response = await fetch(`${API_URL}/api/backups/zone/${encodeURIComponent(backup.zone)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          records: backup.records,
          server: backup.server,
          type: backup.type || 'manual',
          description: backup.description || `Imported from ${file.name}`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import backup');
      }

      const data = await response.json();
      return data.backup;
    } catch (error: unknown) {
      console.error('Failed to import backup:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to import backup: ${error.message}`);
      }
      throw new Error('Failed to import backup: Unknown error');
    }
  }

  // Add type guard for backup validation
  private isValidBackup(backup: unknown): backup is DNSBackup {
    return (
      typeof backup === 'object' &&
      backup !== null &&
      'id' in backup &&
      'timestamp' in backup &&
      'zone' in backup &&
      'server' in backup &&
      'records' in backup &&
      Array.isArray((backup as DNSBackup).records)
    );
  }

  async deleteBackup(zone: string, backupId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/api/backups/zone/${encodeURIComponent(zone)}/${backupId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete backup');
      }

      return true;
    } catch (error) {
      console.error('Failed to delete backup:', error);
      throw error;
    }
  }
}

export const backupService = new BackupService();