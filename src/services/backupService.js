export const backupService = {
  getBackups() {
    try {
      const backups = localStorage.getItem('dnsBackups');
      return backups ? JSON.parse(backups) : [];
    } catch (error) {
      console.error('Failed to get backups:', error);
      return [];
    }
  },

  saveBackup(zone, records) {
    try {
      const backups = this.getBackups();
      const newBackup = {
        timestamp: Date.now(),
        zone,
        records
      };
      backups.push(newBackup);
      localStorage.setItem('dnsBackups', JSON.stringify(backups));
      return newBackup;
    } catch (error) {
      console.error('Failed to save backup:', error);
      throw error;
    }
  },

  async deleteBackup(timestamp) {
    try {
      const backups = this.getBackups();
      
      // Debug logs
      console.log('Deleting backup with timestamp:', timestamp);
      console.log('Current backups:', backups.map(b => ({ 
        timestamp: b.timestamp,
        zone: b.zone 
      })));
      
      const updatedBackups = backups.filter(backup => backup.timestamp !== timestamp);
      
      console.log('Updated backups:', updatedBackups.map(b => ({ 
        timestamp: b.timestamp,
        zone: b.zone 
      })));
      
      // Clear and reset localStorage
      localStorage.removeItem('dnsBackups');
      if (updatedBackups.length > 0) {
        localStorage.setItem('dnsBackups', JSON.stringify(updatedBackups));
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete backup:', error);
      throw error;
    }
  }
}; 