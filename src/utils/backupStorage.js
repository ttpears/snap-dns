const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB

export class BackupStorage {
  constructor(storageKey = 'dns_backups') {
    this.storageKey = storageKey;
  }

  calculateSize(backups) {
    return new Blob([JSON.stringify(backups)]).size;
  }

  getBackups() {
    try {
      const backups = localStorage.getItem(this.storageKey);
      return backups ? JSON.parse(backups) : [];
    } catch (error) {
      console.error('Failed to get backups:', error);
      return [];
    }
  }

  addBackup(backup) {
    try {
      let backups = this.getBackups();
      backups.unshift(backup);

      // Remove oldest backups until we're under size limit
      while (this.calculateSize(backups) > MAX_STORAGE_SIZE && backups.length > 1) {
        backups.pop();
      }

      localStorage.setItem(this.storageKey, JSON.stringify(backups));
      return true;
    } catch (error) {
      console.error('Failed to save backup:', error);
      return false;
    }
  }

  removeBackup(backupId) {
    try {
      const backups = this.getBackups().filter(b => b.id !== backupId);
      localStorage.setItem(this.storageKey, JSON.stringify(backups));
      return true;
    } catch (error) {
      console.error('Failed to remove backup:', error);
      return false;
    }
  }
} 