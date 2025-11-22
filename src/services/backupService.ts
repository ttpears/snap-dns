import { notificationService } from './notificationService';
import { dnsService, type DNSRecord } from './dnsService';
import type { Config, KeyConfig } from '../config';

interface DNSBackup {
  id: string;
  timestamp: number;
  zone: string;
  server: string;
  records: DNSRecord[];
  type: 'auto' | 'manual';
  description?: string;
  version: string;
}

interface BackupOptions {
  type: 'auto' | 'manual';
  description?: string;
  server?: string;
  config: Config;
}

export class BackupService {
  private readonly STORAGE_KEY = 'dnsBackups';
  private readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly MAX_BACKUPS = 50;
  private readonly VERSION = '1.0';

  private calculateSize(backups: DNSBackup[]): number {
    return new Blob([JSON.stringify(backups)]).size;
  }

  getBackups(): DNSBackup[] {
    try {
      const backups = localStorage.getItem(this.STORAGE_KEY);
      return backups ? JSON.parse(backups) : [];
    } catch (error) {
      console.error('Failed to get backups:', error);
      return [];
    }
  }

  async createBackup(zone: string, records: DNSRecord[], options: BackupOptions): Promise<DNSBackup> {
    try {
      const backups = this.getBackups();
      const newBackup: DNSBackup = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        zone,
        server: options.server || options.config.defaultServer,
        records,
        type: options.type,
        description: options.description,
        version: this.VERSION
      };

      backups.unshift(newBackup);

      while (this.calculateSize(backups) > this.MAX_STORAGE_SIZE || backups.length > this.MAX_BACKUPS) {
        backups.pop();
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      
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

      const backups = this.getBackups();
      backups.unshift(backup);

      // Maintain storage limits
      while (this.calculateSize(backups) > this.MAX_STORAGE_SIZE || backups.length > this.MAX_BACKUPS) {
        backups.pop();
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      return backup;
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

  deleteBackup(backupId: string): boolean {
    try {
      const backups = this.getBackups().filter(b => b.id !== backupId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      return true;
    } catch (error) {
      console.error('Failed to delete backup:', error);
      return false;
    }
  }
}

export const backupService = new BackupService();