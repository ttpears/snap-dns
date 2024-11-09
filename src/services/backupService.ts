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

      // Add new backup at the beginning
      backups.unshift(newBackup);

      // Remove oldest backups until we're under size limit
      while (this.calculateSize(backups) > this.MAX_STORAGE_SIZE || backups.length > this.MAX_BACKUPS) {
        backups.pop();
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      
      // Notify if it's a manual backup
      if (options.type === 'manual') {
        await notificationService.notifyBackupCreated(newBackup);
      }

      return newBackup;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  async restoreRecords(backup: DNSBackup, config: Config, selectedRecords?: DNSRecord[]): Promise<void> {
    try {
      const recordsToRestore = selectedRecords || backup.records;
      
      // Get key config for the zone
      const keyConfig = config.keys.find(key => 
        key.zones?.includes(backup.zone) && key.server === backup.server
      );
      
      if (!keyConfig) {
        throw new Error('No key configuration found for this zone and server');
      }

      // Restore records one by one
      for (const record of recordsToRestore) {
        await dnsService.addRecord(backup.zone, record, keyConfig);
      }
    } catch (error) {
      console.error('Failed to restore records:', error);
      throw new Error(`Failed to restore records: ${error.message}`);
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
    } catch (error) {
      console.error('Failed to download backup:', error);
      throw new Error(`Failed to download backup: ${error.message}`);
    }
  }

  async importBackup(file: File, config: Config): Promise<DNSBackup> {
    try {
      const content = await file.text();
      const backup = JSON.parse(content) as DNSBackup;
      
      // Validate backup structure
      if (!backup.zone || !backup.records || !Array.isArray(backup.records)) {
        throw new Error('Invalid backup file structure');
      }

      // Add missing fields for older backups
      const normalizedBackup: DNSBackup = {
        ...backup,
        id: backup.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: backup.timestamp || Date.now(),
        type: backup.type || 'manual',
        version: backup.version || '1.0',
        server: backup.server || config.defaultServer
      };

      // Add to existing backups
      const backups = this.getBackups();
      backups.unshift(normalizedBackup);

      // Maintain size limits
      while (this.calculateSize(backups) > this.MAX_STORAGE_SIZE || backups.length > this.MAX_BACKUPS) {
        backups.pop();
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      return normalizedBackup;
    } catch (error) {
      console.error('Failed to import backup:', error);
      throw new Error(`Failed to import backup: ${error.message}`);
    }
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