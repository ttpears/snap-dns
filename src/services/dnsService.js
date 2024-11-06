import { dnsServer } from './dnsServer';

export const dnsService = {
  async fetchZoneRecords(zoneName, keyConfig) {
    try {
      const records = await dnsServer.getRecords(zoneName, keyConfig);
      return records;
    } catch (error) {
      console.error('Error fetching zone records:', error);
      throw error;
    }
  },

  async addRecord(zone, record, keyConfig) {
    console.log('Adding DNS record:', { zone, record, keyConfig });
    const response = await fetch(`/zone/${zone}/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        record: record
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add record');
    }

    return response.json();
  },

  async updateRecord(zone, originalRecord, newRecord, keyConfig) {
    console.log('Updating DNS record:', { zone, originalRecord, newRecord, keyConfig });
    const response = await fetch(`/api/dns/${zone}/records/${originalRecord.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originalRecord,
        newRecord,
        key: keyConfig
      }),
    });

    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update record');
      } else {
        const text = await response.text();
        throw new Error(`Failed to update record: ${response.status} ${text.substring(0, 100)}`);
      }
    }

    return response.json();
  },

  async deleteRecord(zone, record, keyConfig) {
    console.log('Deleting DNS record:', { zone, record, keyConfig });
    const response = await fetch(`/zone/${zone}/record/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        record: record
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete record');
    }

    return response.json();
  },

  async restoreZone(zoneName, records, keyConfig) {
    try {
      const response = await dnsServer.restoreZone(zoneName, records, keyConfig);
      return response;
    } catch (error) {
      console.error('Error restoring zone:', error);
      throw error;
    }
  }
}; 