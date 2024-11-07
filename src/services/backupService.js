class BackupService {
  constructor() {
    this.STORAGE_KEY = 'dns_backups';
  }

  // Save backup to localStorage
  saveToStorage(backup) {
    try {
      const existingBackups = this.getBackups();
      const backups = [backup, ...existingBackups].slice(0, 50); // Keep last 50 backups
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backups));
      return true;
    } catch (error) {
      console.error('Failed to save backup to storage:', error);
      return false;
    }
  }

  // Get all backups from localStorage
  getBackups() {
    try {
      const backups = localStorage.getItem(this.STORAGE_KEY);
      return backups ? JSON.parse(backups) : [];
    } catch (error) {
      console.error('Failed to get backups from storage:', error);
      return [];
    }
  }

  // Create a backup object
  createBackup(zone, records, type = 'manual') {
    const backup = {
      id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      version: '1.0',
      type, // 'manual' or 'auto'
      timestamp: new Date().toISOString(),
      zone,
      records,
    };

    this.saveToStorage(backup);
    return backup;
  }

  // Download backup as JSON file
  downloadBackup(backup) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${backup.zone}-backup-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  deleteBackup(timestamp) {
    try {
      const backups = this.getBackups();
      const updatedBackups = backups.filter(backup => backup.timestamp !== timestamp);
      localStorage.setItem('dnsBackups', JSON.stringify(updatedBackups));
      return true;
    } catch (error) {
      console.error('Failed to delete backup:', error);
      return false;
    }
  }
}

export const backupService = new BackupService(); 