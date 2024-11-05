class DnsServer {
  constructor() {
    this.baseUrl = '/api/dns';
  }

  async getRecords(zone, keyConfig) {
    const response = await fetch(`${this.baseUrl}/zones/${zone}/records`, {
      method: 'GET',
      headers: this._getHeaders(keyConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch records: ${response.statusText}`);
    }

    return await response.json();
  }

  async addRecord(zone, record, keyConfig) {
    const response = await fetch(`${this.baseUrl}/zones/${zone}/records`, {
      method: 'POST',
      headers: this._getHeaders(keyConfig),
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      throw new Error(`Failed to add record: ${response.statusText}`);
    }

    return await response.json();
  }

  async updateRecord(zone, originalRecord, newRecord, keyConfig) {
    const response = await fetch(`${this.baseUrl}/zones/${zone}/records`, {
      method: 'PUT',
      headers: this._getHeaders(keyConfig),
      body: JSON.stringify({
        original: originalRecord,
        updated: newRecord,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update record: ${response.statusText}`);
    }

    return await response.json();
  }

  async deleteRecord(zone, record, keyConfig) {
    const response = await fetch(`${this.baseUrl}/zones/${zone}/records`, {
      method: 'DELETE',
      headers: this._getHeaders(keyConfig),
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete record: ${response.statusText}`);
    }

    return await response.json();
  }

  _getHeaders(keyConfig) {
    return {
      'Content-Type': 'application/json',
      'X-DNS-Key': keyConfig.id,
      'X-DNS-Server': keyConfig.server,
      'X-DNS-Key-Name': keyConfig.keyName,
      'X-DNS-Key-Value': keyConfig.keyValue,
      'X-DNS-Algorithm': keyConfig.algorithm,
    };
  }
}

export const dnsServer = new DnsServer(); 