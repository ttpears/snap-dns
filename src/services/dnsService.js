const dnsService = {
  async fetchZoneRecords(zoneName, keyConfig) {
    try {
      const response = await fetch(`/api/dns/zones/${zoneName}/records`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-DNS-Key': keyConfig.id
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching zone records:', error);
      throw error;
    }
  },

  async addRecord(zoneName, record, keyConfig) {
    try {
      const response = await fetch(`/api/dns/zones/${zoneName}/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DNS-Key': keyConfig.id
        },
        body: JSON.stringify(record)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error adding record:', error);
      throw error;
    }
  },

  async updateRecord(zoneName, originalRecord, newRecord, keyConfig) {
    try {
      const response = await fetch(`/api/dns/zones/${zoneName}/records`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-DNS-Key': keyConfig.id
        },
        body: JSON.stringify({
          original: originalRecord,
          updated: newRecord
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating record:', error);
      throw error;
    }
  },

  async deleteRecord(zoneName, record, keyConfig) {
    try {
      const response = await fetch(`/api/dns/zones/${zoneName}/records`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-DNS-Key': keyConfig.id
        },
        body: JSON.stringify(record)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error deleting record:', error);
      throw error;
    }
  }
};

export { dnsService }; 