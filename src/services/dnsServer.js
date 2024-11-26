class DnsServer {
  constructor() {
    if (!process.env.REACT_APP_API_URL) {
      console.error('REACT_APP_API_URL is not defined!');
    }
    this.baseUrl = process.env.REACT_APP_API_URL;
    console.log('API URL configured as:', this.baseUrl);
  }

  async getRecords(zoneName, keyConfig, timestamp) {
    try {
      const response = await fetch(
        `${this.baseUrl}/zone/${zoneName}/axfr?t=${timestamp}`, 
        {
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
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch zone records');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching records:', error);
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

  async restoreZone(zone, records, keyConfig) {
    try {
      console.log('Restoring records:', {
        zone,
        recordCount: records.length,
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        algorithm: keyConfig.algorithm
      });

      const response = await fetch(`${this.baseUrl}/zone/${zone}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          server: keyConfig.server,
          keyName: keyConfig.keyName,
          keyValue: keyConfig.keyValue,
          algorithm: keyConfig.algorithm,
          records: records
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`Failed to restore records: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error restoring records:', error);
      throw error;
    }
  }
}

export const dnsServer = new DnsServer(); 