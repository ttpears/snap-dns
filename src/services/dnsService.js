import { localConfig } from '../config/local';

export const SUPPORTED_ALGORITHMS = {
  'hmac-sha512': 'HMAC-SHA512',
  'hmac-sha384': 'HMAC-SHA384',
  'hmac-sha256': 'HMAC-SHA256',
  'hmac-sha224': 'HMAC-SHA224',
  'hmac-sha1': 'HMAC-SHA1',
  'hmac-md5': 'HMAC-MD5'
};

class DNSService {
  constructor() {
    this.baseUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3002'
      : `http://${window.location.hostname}:3002`;
    console.log('DNS Service initialized with baseUrl:', this.baseUrl);
  }

  async getZoneRecords(zoneName, keyConfig) {
    try {
      if (!zoneName || !keyConfig) {
        console.error('Missing required parameters:', { zoneName, keyConfig });
        throw new Error('Zone name and key configuration are required');
      }

      console.log('Starting zone transfer request for:', zoneName);
      console.log('Using key config:', {
        ...keyConfig,
        keyValue: keyConfig.keyValue ? '[REDACTED]' : 'MISSING'
      });

      const url = `${this.baseUrl}/zone/${encodeURIComponent(zoneName)}/axfr`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm
        })
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error response:', errorData);
        throw new Error(errorData.message || 'Failed to fetch zone records');
      }
      
      const data = await response.json();
      console.log(`Successfully received ${data.length} records for zone ${zoneName}`);
      return data;
    } catch (error) {
      console.error('DNS service error:', error);
      throw new Error('Failed to fetch zone records');
    }
  }

  async executeNSUpdate(commands, keyConfig) {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/nsupdate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          commands,
          keyConfig: {
            name: keyConfig.name,
            value: keyConfig.value,
            algorithm: keyConfig.algorithm || 'hmac-sha512'
          }
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute nsupdate commands');
      }

      return await response.json();
    } catch (error) {
      console.error('NSUpdate error:', error);
      throw error;
    }
  }

  async validateRecord(record, resolver) {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ record, resolver }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to validate record');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Validation error:', error);
      throw error;
    }
  }

  async addRecord(zone, record, keyConfig) {
    try {
      console.log('Adding record to zone:', zone);
      console.log('Record:', record);
      console.log('Using key config:', {
        ...keyConfig,
        keyValue: '[REDACTED]'
      });

      const url = `${this.baseUrl}/zone/${encodeURIComponent(zone)}/record`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm,
          record: {
            name: record.name,
            type: record.type,
            value: record.value,
            ttl: parseInt(record.ttl, 10)
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add record');
      }
      
      const data = await response.json();
      console.log('Record added successfully:', data);
      return data;
    } catch (error) {
      console.error('DNS service error:', error);
      throw error;
    }
  }
}

export const dnsService = new DNSService(); 