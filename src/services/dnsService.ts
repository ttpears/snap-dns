interface DNSRecord {
  name: string;
  type: string;
  value: string;
  ttl: number;
}

interface Zone {
  name: string;
  records: DNSRecord[];
}

class DNSService {
  private async executeNSUpdate(commands: string[]): Promise<void> {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/nsupdate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ commands }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to execute nsupdate commands');
      }
    } catch (error) {
      console.error('NSUpdate error:', error);
      throw error;
    }
  }

  async getZones(): Promise<Zone[]> {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/zones`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch zones:', error);
      throw error;
    }
  }

  async validateRecord(record: DNSRecord, resolver: string): Promise<boolean> {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ record, resolver }),
      });
      return response.ok;
    } catch (error) {
      console.error('Validation error:', error);
      return false;
    }
  }
}

export const dnsService = new DNSService();