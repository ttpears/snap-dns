class DnsServer {
  constructor() {
    this.baseUrl = 'http://localhost:3002';
  }

  async getRecords(zone, keyConfig) {
    try {
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
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('DNS Server error:', error);
      throw error;
    }
  }

  async addRecord(zone, record, keyConfig) {
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
      throw new Error(`Failed to add record: ${errorText}`);
    }

    return await response.json();
  }

  async updateRecord(zone, originalRecord, newRecord, keyConfig) {
    throw new Error('Update operation not yet implemented in backend');
  }

  async deleteRecord(zone, record, keyConfig) {
    throw new Error('Delete operation not yet implemented in backend');
  }
}

export const dnsServer = new DnsServer(); 