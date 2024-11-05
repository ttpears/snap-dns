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
    this.baseUrl = 'http://172.16.16.140:3002';  // Use the actual IP address instead of 0.0.0.0
  }

  async getZoneRecords(zoneName, keyConfig) {
    try {
      console.log('Fetching zone:', zoneName);
      console.log('Using key config:', {
        ...keyConfig,
        keyValue: '[REDACTED]'
      });

      const params = new URLSearchParams({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm
      });

      const url = `${this.baseUrl}/zone/${encodeURIComponent(zoneName)}/axfr`;
      console.log('Request URL:', url.replace(keyConfig.keyValue, '[REDACTED]'));

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors'  // Explicitly enable CORS
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Received ${data.length} records for zone ${zoneName}`);
      return data;
    } catch (error) {
      console.error('DNS service error:', error);
      throw error;
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
}

export const dnsService = new DNSService(); 