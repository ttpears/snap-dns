import { DNSRecord, ZoneConfig, ZoneOperationResult } from '../types/dns';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import * as dnsPacket from 'dns-packet';
import { config } from '../config';

const execAsync = promisify(exec);

// Configuration for zone transfer limits
const ZONE_TRANSFER_CONFIG = {
  // Maximum number of records to load into memory
  maxRecords: parseInt(process.env.MAX_ZONE_RECORDS || '10000', 10),
  // Warning threshold (warn when approaching limit)
  warningThreshold: parseInt(process.env.ZONE_RECORDS_WARNING_THRESHOLD || '5000', 10),
  // Maximum output size from dig (in bytes) - prevents memory exhaustion from huge responses
  maxOutputSize: parseInt(process.env.MAX_DIG_OUTPUT_SIZE || String(50 * 1024 * 1024), 10), // 50MB default
};

class DNSService {
  private initialized = false;

  /**
   * Get temp directory from config
   */
  private getTempDir(): string {
    return process.env.TEMP_DIR || config.tempDir || '/tmp/snap-dns';
  }

  /**
   * Initialize service and ensure temp directory exists
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const tempDir = this.getTempDir();
      await mkdir(tempDir, { recursive: true });
      console.log(`Temporary directory ready: ${tempDir}`);
      this.initialized = true;
    } catch (error) {
      console.error('Failed to create temporary directory:', error);
      throw new Error(`Failed to create temporary directory: ${this.getTempDir()}`);
    }
  }

  private async createNSUpdateFile(zone: string, record: DNSRecord, keyConfig: ZoneConfig, isDelete = false): Promise<string> {
    await this.initialize();
    const updateFile = join(this.getTempDir(), `update-${Date.now()}-${Math.random()}.txt`);
    // For deletions, include RDATA to delete only the specific RR, not the entire RRset
    const deleteCommand = (() => {
      if (!isDelete) return '';
      const hasData = record.value !== undefined && record.value !== null && record.value !== '';
      if (!hasData || record.type === 'SOA') {
        // Without specific RDATA (or for SOA), delete the whole RRset
        return `update delete ${record.name} ${record.type}`;
      }
      // Use the provided value verbatim so it matches add semantics
      const rdata = typeof record.value === 'object' ? this.formatSOA(record.value) : String(record.value);
      return `update delete ${record.name} ${record.type} ${rdata}`;
    })();

    const addCommand = `update add ${record.name} ${record.ttl} ${record.class || 'IN'} ${record.type} ${
      typeof record.value === 'object' ? this.formatSOA(record.value) : record.value
    }`;

    const commands = [
      `server ${keyConfig.server}`,
      `zone ${zone}`,
      isDelete ? deleteCommand : addCommand,
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

      // Set a reasonable buffer size limit for child_process
      const maxBuffer = ZONE_TRANSFER_CONFIG.maxOutputSize;

      const { stdout, stderr } = await execAsync(
        `dig @${keyConfig.server} ${zone} AXFR -y ${keyConfig.algorithm}:${keyConfig.keyName}:${keyConfig.keyValue}`,
        { maxBuffer }
      );

      if (stderr) {
        console.error('dig error:', stderr);
      }

      // Check output size
      const outputSize = Buffer.byteLength(stdout, 'utf8');
      if (outputSize > ZONE_TRANSFER_CONFIG.maxOutputSize * 0.9) {
        console.warn(`⚠️  Zone ${zone} transfer size (${(outputSize / 1024 / 1024).toFixed(2)}MB) is approaching the limit`);
      }

      // Create a Map to deduplicate records
      const recordMap = new Map<string, DNSRecord>();
      let recordCount = 0;
      let skippedCount = 0;

      // Split and filter lines
      const lines = stdout
        .split('\n')
        .filter(line => !line.startsWith(';') && line.trim() !== '');

      // Check if zone is too large
      if (lines.length > ZONE_TRANSFER_CONFIG.maxRecords) {
        throw new Error(
          `Zone ${zone} has too many records (${lines.length} lines). ` +
          `Maximum allowed is ${ZONE_TRANSFER_CONFIG.maxRecords}. ` +
          `Consider increasing MAX_ZONE_RECORDS environment variable or implementing pagination.`
        );
      }

      // Warn if approaching limit
      if (lines.length > ZONE_TRANSFER_CONFIG.warningThreshold) {
        console.warn(
          `⚠️  Zone ${zone} has ${lines.length} records, approaching limit of ${ZONE_TRANSFER_CONFIG.maxRecords}`
        );
      }

      // Parse dig output into DNS packet format
      for (const line of lines) {
        // Safety check - stop if we've somehow exceeded the limit
        if (recordMap.size >= ZONE_TRANSFER_CONFIG.maxRecords) {
          console.error(
            `❌ Stopped parsing zone ${zone} after reaching ${ZONE_TRANSFER_CONFIG.maxRecords} unique records`
          );
          throw new Error(
            `Zone ${zone} exceeded maximum record limit of ${ZONE_TRANSFER_CONFIG.maxRecords} unique records`
          );
        }

        try {
          recordCount++;
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
            } else {
              skippedCount++;
            }
          }
        } catch (error) {
          console.error('Failed to parse record:', line, error);
        }
      }

      const records = Array.from(recordMap.values());

      // Log statistics
      console.log(`Zone ${zone} transfer complete:`, {
        totalLines: lines.length,
        parsedRecords: recordCount,
        uniqueRecords: records.length,
        duplicatesSkipped: skippedCount,
        memorySizeMB: (outputSize / 1024 / 1024).toFixed(2)
      });

      return records;
    } catch (error) {
      console.error('Error fetching zone records:', error);

      // Provide helpful error message if it's a size limit error
      if (error instanceof Error && error.message.includes('maxBuffer')) {
        throw new Error(
          `Zone ${zone} transfer exceeded maximum buffer size. ` +
          `The zone is too large to load into memory. ` +
          `Consider increasing MAX_DIG_OUTPUT_SIZE environment variable.`
        );
      }

      throw new Error(`Failed to fetch zone records: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async addRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<ZoneOperationResult> {
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'DUPLICATE_RECORD') {
          throw new Error(`Record already exists: ${record.name} ${record.type} ${record.value}`);
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
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

  /**
   * Atomically update a DNS record using a single nsupdate transaction
   * This prevents data loss by performing both delete and add in one operation
   */
  async updateRecord(
    zone: string,
    oldRecord: DNSRecord,
    newRecord: DNSRecord,
    keyConfig: ZoneConfig
  ): Promise<ZoneOperationResult> {
    await this.initialize();
    const updateFile = join(this.getTempDir(), `update-${Date.now()}-${Math.random()}.txt`);

    try {
      // Build delete command for old record
      const hasOldData = oldRecord.value !== undefined && oldRecord.value !== null && oldRecord.value !== '';
      let deleteCommand: string;

      if (!hasOldData || oldRecord.type === 'SOA') {
        // Without specific RDATA (or for SOA), delete the whole RRset
        deleteCommand = `update delete ${oldRecord.name} ${oldRecord.type}`;
      } else {
        // Delete specific record with RDATA
        const oldRdata = typeof oldRecord.value === 'object'
          ? this.formatSOA(oldRecord.value)
          : String(oldRecord.value);
        deleteCommand = `update delete ${oldRecord.name} ${oldRecord.type} ${oldRdata}`;
      }

      // Build add command for new record
      const addCommand = `update add ${newRecord.name} ${newRecord.ttl} ${newRecord.class || 'IN'} ${newRecord.type} ${
        typeof newRecord.value === 'object' ? this.formatSOA(newRecord.value) : newRecord.value
      }`;

      // Create atomic transaction - both commands in single nsupdate file
      const commands = [
        `server ${keyConfig.server}`,
        `zone ${zone}`,
        deleteCommand,
        addCommand,
        'send'  // Single send makes this atomic
      ];

      await writeFile(updateFile, commands.join('\n'));

      try {
        const { stdout, stderr } = await execAsync(
          `nsupdate -y ${keyConfig.algorithm}:${keyConfig.keyName}:${keyConfig.keyValue} ${updateFile}`
        );

        if (stderr) {
          console.error('nsupdate error:', stderr);
          throw new Error(stderr);
        }

        return { success: true, message: 'Record updated successfully' };
      } finally {
        // Clean up the temporary file
        await unlink(updateFile).catch(console.error);
      }
    } catch (error) {
      console.error('Error updating record:', error);
      throw new Error(`Failed to update record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const dnsService = new DNSService(); 