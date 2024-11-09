import { dnsServer } from './dnsServer';
import { qualifyDnsName } from '../utils/dnsUtils';

const API_URL = process.env.REACT_APP_API_URL || '';

function isMultilineType(type) {
  return ['SOA', 'TXT', 'MX', 'SRV', 'CAA'].includes(type);
}

function parseSOARecord(lines) {
  // Join all lines and remove comments after semicolons
  const soaText = lines.map(line => line.split(';')[0].trim()).join(' ');
  
  // Extract the content between parentheses if present
  const parenthesesMatch = soaText.match(/\(([\s\S]*?)\)/);
  
  // Get the initial part (nameserver and admin email)
  const initialPart = soaText.split('(')[0].trim();
  const [primaryNS, adminMailbox] = initialPart.split(/\s+/).filter(Boolean);
  
  // Get the values part (either from within parentheses or after the initial part)
  const valuesPart = parenthesesMatch ? parenthesesMatch[1] : soaText.split(')')[1] || '';
  
  // Extract all numbers from the values part
  const numbers = valuesPart.split(/\s+/).map(Number).filter(n => !isNaN(n));
  
  // Construct the SOA object
  const soa = {
    primaryNS: primaryNS || 'N/A',
    adminMailbox: (adminMailbox || 'N/A').replace('@', '.'),
    serial: numbers[0] || 0,
    refresh: numbers[1] || 0,
    retry: numbers[2] || 0,
    expire: numbers[3] || 0,
    minimum: numbers[4] || 0
  };

  // Debug logging
  console.log('SOA Parsing:', {
    lines,
    soaText,
    initialPart,
    valuesPart,
    numbers,
    result: soa
  });

  return soa;
}

function formatRecordValue(type, lines) {
  switch (type) {
    case 'SOA':
      return parseSOARecord(lines);
    
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

  const lines = zoneData
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.includes('TSIG') && !line.includes('key "'));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\S+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
    
    if (!match) {
      if (currentRecord && line.trim()) {
        recordLines.push(line.trim());
      }
      continue;
    }

    const [, name, ttl, recordClass, type, value = ''] = match;

    // Skip TSIG-related records
    if (type === 'KEY' || type === 'TSIG') {
      continue;
    }

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
      isMultiline: isMultilineType(type)
    };
    recordLines = [value];

    if (!isMultilineType(type)) {
      records.push(currentRecord);
      currentRecord = null;
      recordLines = [];
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
    let formattedValue;

    if (newRecord.type === 'SOA') {
      // Format SOA record according to DNS standards
      formattedValue = this.formatSOARecord(newRecord.value);
    } else if (['TXT', 'SPF'].includes(newRecord.type)) {
      // Handle TXT/SPF records - ensure proper quoting
      formattedValue = this.formatTXTRecord(newRecord.value);
    } else {
      formattedValue = newRecord.value;
    }

    const response = await fetch(`${API_URL}/zone/${zone}/record/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm,
        originalRecord: {
          ...originalRecord,
          value: typeof originalRecord.value === 'object' 
            ? this.formatSOARecord(originalRecord.value)
            : originalRecord.value
        },
        newRecord: {
          ...newRecord,
          value: formattedValue
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update record');
    }

    return response.json();
  },

  formatSOARecord(soa) {
    // Format: primary-ns admin-email (serial refresh retry expire minimum)
    return `${soa.mname} ${soa.rname} (
      ${soa.serial}  ; serial
      ${soa.refresh} ; refresh
      ${soa.retry}   ; retry
      ${soa.expire}  ; expire
      ${soa.minimum} ; minimum
    )`.replace(/\n\s+/g, ' ');
  },

  formatTXTRecord(value) {
    // Handle TXT record formatting
    // Split long TXT records into quoted strings
    const chunks = [];
    let remaining = value;
    const maxLength = 255;

    while (remaining.length > 0) {
      let chunk = remaining.substring(0, maxLength);
      // Ensure we don't split in the middle of a character
      if (remaining.length > maxLength) {
        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace !== -1) {
          chunk = chunk.substring(0, lastSpace);
        }
      }
      chunks.push(`"${chunk}"`);
      remaining = remaining.substring(chunk.length).trim();
    }

    return chunks.join(' ');
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