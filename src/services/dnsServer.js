class DnsServer {
  constructor() {
    if (!process.env.REACT_APP_API_URL) {
      console.error('REACT_APP_API_URL is not defined!');
    }
    this.baseUrl = process.env.REACT_APP_API_URL;
    console.log('API URL configured as:', this.baseUrl);
  }

  async getRecords(zone, keyConfig) {
    try {
      const url = `${this.baseUrl}/zone/${zone}/axfr`;
      console.log('Making AXFR request to:', url);
      
      const response = await fetch(url, {
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
      const url = `${this.baseUrl}/zone/${zone}/record`;
      console.log('Making add record request to:', url);
      
      const response = await fetch(url, {
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
    try {
      console.log('Deleting record:', {
        zone,
        record,
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        algorithm: keyConfig.algorithm
      });

      const response = await fetch(`${this.baseUrl}/zone/${zone}/record/delete`, {
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
        throw new Error(`Failed to delete record: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting record:', error);
      throw error;
    }
  }
}

export const dnsServer = new DnsServer(); 