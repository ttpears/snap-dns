import { dnsServer } from './dnsServer';

const dnsService = {
  async fetchZoneRecords(zoneName, keyConfig) {
    try {
      const records = await dnsServer.getRecords(zoneName, keyConfig);
      return records;
    } catch (error) {
      console.error('Error fetching zone records:', error);
      throw error;
    }
  },

  async addRecord(zoneName, record, keyConfig) {
    try {
      console.log('dnsService adding record:', {
        zoneName,
        record,
        keyConfig: { ...keyConfig, keyValue: '[REDACTED]' }
      });
      
      const result = await dnsServer.addRecord(zoneName, record, keyConfig);
      return result;
    } catch (error) {
      console.error('Error in dnsService.addRecord:', error);
      throw error;
    }
  },

  async updateRecord(zoneName, originalRecord, newRecord, keyConfig) {
    try {
      await dnsServer.updateRecord(zoneName, originalRecord, newRecord, keyConfig);
      return { success: true };
    } catch (error) {
      console.error('Error updating record:', error);
      throw error;
    }
  },

  async deleteRecord(zoneName, record, keyConfig) {
    try {
      await dnsServer.deleteRecord(zoneName, record, keyConfig);
      return { success: true };
    } catch (error) {
      console.error('Error deleting record:', error);
      throw error;
    }
  }
};

export { dnsService }; 