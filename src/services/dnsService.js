import { dnsServer } from './dnsServer';

const API_URL = process.env.REACT_APP_API_URL || '';

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
    
    // Properly handle domain qualification
    let fullyQualifiedName;
    if (record.name.endsWith(zone)) {
      // Already includes zone, just ensure it ends with period
      fullyQualifiedName = record.name.endsWith('.') ? record.name : `${record.name}.`;
    } else if (record.name.includes('.')) {
      // Contains dots but doesn't end with zone - check if it's a subdomain
      const nameParts = record.name.split('.');
      const zoneParts = zone.split('.');
      
      // Check if the end parts match the zone
      const endsWithZone = zoneParts.every((part, index) => 
        nameParts[nameParts.length - zoneParts.length + index] === part
      );
      
      if (endsWithZone) {
        fullyQualifiedName = record.name.endsWith('.') ? record.name : `${record.name}.`;
      } else {
        fullyQualifiedName = `${record.name}.${zone}.`;
      }
    } else {
      // Simple name, append zone
      fullyQualifiedName = `${record.name}.${zone}.`;
    }

    console.log('Using fully qualified name:', fullyQualifiedName);

    const response = await fetch(`${API_URL}/zone/${zone}/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        record: {
          name: fullyQualifiedName,
          type: record.type,
          value: record.value,
          ttl: record.ttl
        }
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
    const response = await fetch(`${API_URL}/zone/${zone}/record/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        originalRecord,
        newRecord
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update record');
    }

    return response.json();
  },

  async deleteRecord(zone, record, keyConfig) {
    console.log('Deleting DNS record:', { zone, record, keyConfig });
    const response = await fetch(`${API_URL}/zone/${zone}/record/delete`, {
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