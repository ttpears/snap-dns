import { DNSRecord, ZoneConfig, ZoneOperationResult } from '../types/dns';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as dnsPacket from 'dns-packet';

const execAsync = promisify(exec);

class DNSService {
  private async createNSUpdateFile(zone: string, record: DNSRecord, keyConfig: ZoneConfig, isDelete = false): Promise<string> {
    const updateFile = join('/tmp/snap-dns', `update-${Date.now()}-${Math.random()}.txt`);
    const commands = [
      `server ${keyConfig.server}`,
      `zone ${zone}`,
      isDelete ? `update delete ${record.name} ${record.type}` : 
                 `update add ${record.name} ${record.ttl} ${record.class || 'IN'} ${record.type} ${
                   typeof record.value === 'object' ? this.formatSOA(record.value) : record.value
                 }`,
      'send'
    ];

    await writeFile(updateFile, commands.join('\n'));
    return updateFile;
  }

  private formatSOA(soa: any): string {
    return `${soa.mname} ${soa.rname} ${soa.serial || 1} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minimum}`;
  }

  private parseSOA(value: string): any {
    const [mname, rname, serial, refresh, retry, expire, minimum] = value.split(/\s+/);
    return {
      mname: mname.toLowerCase().replace(/\.+$/, ''),
      rname: rname.toLowerCase().replace(/\.+$/, ''),
      serial: parseInt(serial),
      refresh: parseInt(refresh) || 0,
      retry: parseInt(retry) || 0,
      expire: parseInt(expire) || 0,
      minimum: parseInt(minimum) || 0
    };
  }

  private normalizeRecord(record: any): DNSRecord {
    let value = record.data;

    // Handle different record types
    switch (record.type) {
      case 'SOA': {
        // For SOA records, ensure consistent format whether from dig or object
        const soaData = typeof value === 'string' ? this.parseSOA(value) : value;
        value = {
          mname: soaData.mname.toLowerCase().replace(/\.+$/, ''),
          rname: soaData.rname.toLowerCase().replace(/\.+$/, ''),
          serial: soaData.serial,
          refresh: parseInt(soaData.refresh) || 0,
          retry: parseInt(soaData.retry) || 0,
          expire: parseInt(soaData.expire) || 0,
          minimum: parseInt(soaData.minimum) || 0
        };
        break;
      }
      case 'MX':
        value = `${record.data.preference} ${record.data.exchange.toLowerCase().replace(/\.+$/, '')}`;
        break;
      case 'SRV':
        value = `${record.data.priority} ${record.data.weight} ${record.data.port} ${record.data.target.toLowerCase().replace(/\.+$/, '')}`;
        break;
      case 'TXT':
        value = Array.isArray(record.data) ? record.data.join(' ') : record.data;
        break;
      default:
        if (typeof value === 'string') {
          value = value.toLowerCase().replace(/\.+$/, '');
        }
    }

    return {
      name: record.name.toLowerCase().replace(/\.+$/, ''),
      type: record.type,
      value,
      ttl: record.ttl,
      class: record.class || 'IN'
    };
  }

  async fetchZoneRecords(zone: string, keyConfig: ZoneConfig): Promise<DNSRecord[]> {
    try {
      console.log('Fetching records for zone:', zone);
      const { stdout, stderr } = await execAsync(
        `dig @${keyConfig.server} ${zone} AXFR -y ${keyConfig.algorithm}:${keyConfig.keyName}:${keyConfig.keyValue}`
      );

      if (stderr) {
        console.error('dig error:', stderr);
      }

      // Create a Map to deduplicate records
      const recordMap = new Map<string, DNSRecord>();

      // Parse dig output into DNS packet format
      stdout
        .split('\n')
        .filter(line => !line.startsWith(';') && line.trim() !== '')
        .forEach(line => {
          try {
            const parts = line.split(/\s+/);
            const [name, ttl, recordClass, type, ...data] = parts;

            // Create a DNS packet record
            const packetRecord = {
              name,
              ttl: parseInt(ttl),
              class: recordClass,
              type,
              data: type === 'SOA' ? this.parseSOA(data.join(' ')) :
                    type === 'MX' ? { preference: parseInt(data[0]), exchange: data[1] } :
                    type === 'SRV' ? {
                      priority: parseInt(data[0]),
                      weight: parseInt(data[1]),
                      port: parseInt(data[2]),
                      target: data[3]
                    } :
                    data.join(' ')
            };

            const normalizedRecord = this.normalizeRecord(packetRecord);
            if (normalizedRecord) {
              // Create a unique key for the record
              const key = `${normalizedRecord.name}|${normalizedRecord.type}|${
                normalizedRecord.type === 'SOA' ? 'SOA' : JSON.stringify(normalizedRecord.value)
              }`;
              
              // Only add if we haven't seen this record before
              if (!recordMap.has(key)) {
                recordMap.set(key, normalizedRecord);
              }
            }
          } catch (error) {
            console.error('Failed to parse record:', line, error);
          }
        });

      const records = Array.from(recordMap.values());
      
      // Log the parsed records for debugging
      console.log('Parsed records:', JSON.stringify(records, null, 2));
      return records;
    } catch (error) {
      console.error('Error fetching zone records:', error);
      throw new Error(`Failed to fetch zone records: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async addRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<void> {
    try {
      // Get existing records first
      const existingRecords = await this.fetchZoneRecords(zone, keyConfig);
      
      // Check for duplicate records
      const isDuplicate = existingRecords.some(existing => 
        existing.name === record.name && 
        existing.type === record.type &&
        existing.value === record.value
      );

      if (isDuplicate) {
        throw new Error('DUPLICATE_RECORD');
      }

      const updateFile = await this.createNSUpdateFile(zone, record, keyConfig);
      
      try {
        const { stdout, stderr } = await execAsync(
          `nsupdate -y ${keyConfig.algorithm}:${keyConfig.keyName}:${keyConfig.keyValue} ${updateFile}`
        );

        if (stderr) {
          console.error('nsupdate error:', stderr);
          throw new Error(stderr);
        }

        return { success: true, message: 'Record added successfully' };
      } finally {
        // Clean up the temporary file
        await unlink(updateFile).catch(console.error);
      }
    } catch (error) {
      if (error.message === 'DUPLICATE_RECORD') {
        throw new Error(`Record already exists: ${record.name} ${record.type} ${record.value}`);
      }
      throw error;
    }
  }

  async deleteRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<ZoneOperationResult> {
    try {
      const updateFile = await this.createNSUpdateFile(zone, record, keyConfig, true);
      
      try {
        const { stdout, stderr } = await execAsync(
          `nsupdate -y ${keyConfig.algorithm}:${keyConfig.keyName}:${keyConfig.keyValue} ${updateFile}`
        );

        if (stderr) {
          console.error('nsupdate error:', stderr);
          throw new Error(stderr);
        }

        return { success: true, message: 'Record deleted successfully' };
      } finally {
        // Clean up the temporary file
        await unlink(updateFile).catch(console.error);
      }
    } catch (error) {
      console.error('Error deleting record:', error);
      throw new Error(`Failed to delete record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const dnsService = new DNSService(); 