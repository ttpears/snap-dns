class DnsServer {
  constructor() {
    this.baseUrl = process.env.REACT_APP_API_URL;
    console.log('Using backend URL:', this.baseUrl);
  }

  async getRecords(zone, keyConfig) {
    try {
      console.log('Making AXFR request to:', `${this.baseUrl}/zone/${zone}/axfr`);
      
      const response = await fetch(`${this.baseUrl}/zone/${zone}/axfr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`Server error: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('DNS Server error:', error);
      throw error;
    }
  }

  async addRecord(zone, record, keyConfig) {
    try {
      console.log('Adding record:', {
        zone,
        record,
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        algorithm: keyConfig.algorithm
      });

      const response = await fetch(`${this.baseUrl}/zone/${zone}/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm,
          record: record
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`Failed to add record: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding record:', error);
      throw error;
    }
  }

  async updateRecord(zone, originalRecord, newRecord, keyConfig) {
    throw new Error('Update operation not yet implemented in backend');
  }

  async deleteRecord(zone, record, keyConfig) {
    throw new Error('Delete operation not yet implemented in backend');
  }
}

export const dnsServer = new DnsServer(); 