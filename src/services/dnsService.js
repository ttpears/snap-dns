export const SUPPORTED_ALGORITHMS = {
  'hmac-sha512': 'HMAC-SHA512',
  'hmac-sha384': 'HMAC-SHA384',
  'hmac-sha256': 'HMAC-SHA256',
  'hmac-sha224': 'HMAC-SHA224',
  'hmac-sha1': 'HMAC-SHA1',
  'hmac-md5': 'HMAC-MD5'
};

class DNSService {
  async getZoneRecords(zoneName, keyConfig) {
    try {
      const params = new URLSearchParams({
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm
      });

      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/zone/${encodeURIComponent(zoneName)}/axfr?${params}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch zone records');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch zone records:', error);
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