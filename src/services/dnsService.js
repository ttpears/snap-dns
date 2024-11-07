import { dnsServer } from './dnsServer';
import { qualifyDnsName } from '../utils/dnsUtils';

const API_URL = process.env.REACT_APP_API_URL || '';

function isMultilineType(type) {
  return ['SOA', 'TXT', 'MX', 'SRV', 'CAA'].includes(type);
}

function formatRecordValue(type, lines) {
  switch (type) {
    case 'SOA':
      const soaString = lines
        .join(' ')
        .replace(/[()]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const soaParts = soaString.split(/\s+/);
      if (soaParts.length >= 7) {
        return {
          primaryNS: soaParts[0],
          adminMailbox: soaParts[1],
          serial: soaParts[2],
          refresh: soaParts[3],
          retry: soaParts[4],
          expire: soaParts[5],
          minimum: soaParts[6]
        };
      }
      return soaString;
    
    case 'TXT':
      return lines
        .join(' ')
        .replace(/"\s+"/g, '')
        .trim();
    
    case 'MX':
      return lines
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    case 'SRV':
      return lines
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    case 'CAA':
      return lines
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    default:
      return lines.join(' ').trim();
  }
}

export async function parseZoneRecords(zoneData) {
  const records = [];
  let currentRecord = null;
  let recordLines = [];
  let isPartOfMultiline = false;

  const lines = zoneData.split('\n').map(line => line.trim()).filter(line => line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('key "') || line.includes('TSIG')) {
      continue;
    }

    const match = line.match(/^(\S+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
    if (!match) {
      if (currentRecord && line.trim()) {
        recordLines.push(line.trim());
        records.push({
          ...currentRecord,
          value: line.trim(),
          isPartOfMultiline: true,
          parentRecord: currentRecord.id
        });
      }
      continue;
    }

    const [, name, ttl, recordClass, type, value = ''] = match;

    if (type) {
      if (currentRecord) {
        currentRecord.value = formatRecordValue(currentRecord.type, recordLines);
        records.push(currentRecord);
      }

      const recordId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      currentRecord = {
        id: recordId,
        name,
        ttl: parseInt(ttl),
        class: recordClass,
        type,
        value,
        isPartOfMultiline: false,
        parentRecord: null
      };
      recordLines = [value];
      
      if (!isMultilineType(type)) {
        records.push(currentRecord);
        currentRecord = null;
        recordLines = [];
      }
    }
  }

  if (currentRecord) {
    currentRecord.value = formatRecordValue(currentRecord.type, recordLines);
    records.push(currentRecord);
  }

  return records;
}

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
    
    const fullyQualifiedName = qualifyDnsName(record.name, zone);
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
    
    const qualifiedOriginal = {
      ...originalRecord,
      name: qualifyDnsName(originalRecord.name, zone)
    };
    
    const qualifiedNew = {
      ...newRecord,
      name: qualifyDnsName(newRecord.name, zone)
    };

    const API_URL = process.env.REACT_APP_API_URL;
    
    const response = await fetch(`${API_URL}/zone/${zone}/record`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        originalRecord: qualifiedOriginal,
        newRecord: qualifiedNew
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
  },

  updateRecord: async (zone, originalRecord, newRecord, keyConfig) => {
    const response = await fetch(`${API_URL}/zone/${zone}/record`, {
      method: 'PUT',
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
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to modify record');
    }

    return response.json();
  }
}; 