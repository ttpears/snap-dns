// backend/src/services/dnsService.ts
import { DNSRecord, ZoneConfig, ZoneOperationResult } from '../types/dns';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import { assertNoControlChars, isValidDnsName, isValidZoneName } from './dnsSafety';
import { parseTxtRdata, quoteTxtValue } from './dnsPresentation';

// execFile (not exec) runs the binary directly with an argv array — no shell is
// spawned, so zone/server/key arguments cannot be interpreted as shell syntax.
const execFileAsync = promisify(execFile);

// TSIG algorithms we will write into a BIND key file. Matches the zod enum used
// when keys are created; re-checked here as defence in depth before the value is
// interpolated into the key clause.
const ALLOWED_TSIG_ALGORITHMS = new Set([
  'hmac-md5', 'hmac-sha1', 'hmac-sha224', 'hmac-sha256', 'hmac-sha384', 'hmac-sha512',
]);

// A DNS server address is a bare host or IP: no whitespace (would split the
// nsupdate `server` directive) and no control characters (would inject one).
// eslint-disable-next-line no-control-regex -- matching control bytes is the point
const SERVER_UNSAFE = /[\s\x00-\x1f\x7f]/;

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
    // config.tempDir already resolves TEMP_DIR || '/tmp/snap-dns'.
    return config.tempDir;
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

  /**
   * Validate the TSIG material before it is written into a key file or used as a
   * command argument. Rejects anything that could break out of the key clause or
   * inject shell/command syntax. (execFile already prevents shell interpretation;
   * these checks additionally protect the generated key-file contents.)
   */
  private validateKeyConfig(keyConfig: ZoneConfig): void {
    if (!keyConfig.server || SERVER_UNSAFE.test(keyConfig.server)) {
      throw new Error('Invalid DNS server address');
    }
    if (!/^[A-Za-z0-9._-]+$/.test(keyConfig.keyName)) {
      throw new Error('Invalid TSIG key name');
    }
    if (!ALLOWED_TSIG_ALGORITHMS.has(keyConfig.algorithm)) {
      throw new Error(`Unsupported TSIG algorithm: ${keyConfig.algorithm}`);
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(keyConfig.keyValue)) {
      throw new Error('Invalid TSIG key secret');
    }
  }

  /**
   * Validate every field of a record that will be interpolated into an nsupdate
   * command file, so no field can inject an extra directive or split a token.
   */
  private assertSafeRecord(record: DNSRecord): void {
    if (!isValidDnsName(record.name)) {
      throw new Error(`Invalid record name: ${record.name}`);
    }
    assertNoControlChars(String(record.type), 'record type');
    if (record.class) assertNoControlChars(String(record.class), 'record class');

    const value = record.value as unknown;
    if (typeof value === 'string') {
      assertNoControlChars(value, 'record value');
    } else if (Array.isArray(value)) {
      value.forEach((seg, i) => assertNoControlChars(String(seg), `record value segment ${i}`));
    } else if (value && typeof value === 'object') {
      for (const [field, fieldValue] of Object.entries(value)) {
        if (typeof fieldValue === 'string') assertNoControlChars(fieldValue, `record value ${field}`);
      }
    }
  }

  /**
   * Write a short-lived BIND key file for `dig -k` / `nsupdate -k`. Passing the
   * secret via a 0600 file instead of `-y alg:name:secret` keeps it out of the
   * process argument list (visible in `ps`), per RFC 8945 secret-handling
   * guidance. Caller is responsible for unlinking the returned path.
   */
  private async writeKeyFile(keyConfig: ZoneConfig): Promise<string> {
    await this.initialize();
    const keyFile = join(this.getTempDir(), `key-${Date.now()}-${Math.random()}.conf`);
    const content =
      `key "${keyConfig.keyName}" {\n` +
      `    algorithm ${keyConfig.algorithm};\n` +
      `    secret "${keyConfig.keyValue}";\n` +
      `};\n`;
    await writeFile(keyFile, content, { mode: 0o600 });
    return keyFile;
  }

  /** Run `nsupdate -k <keyfile> <updateFile>` with no shell. */
  private async runNsupdate(updateFile: string, keyConfig: ZoneConfig): Promise<void> {
    this.validateKeyConfig(keyConfig);
    const keyFile = await this.writeKeyFile(keyConfig);
    try {
      const { stderr } = await execFileAsync('nsupdate', ['-k', keyFile, updateFile]);
      if (stderr) {
        // nsupdate exits non-zero on real failure (execFile rejects and the
        // callers surface it). stderr on a zero-exit run is a non-fatal
        // diagnostic — logging it must not turn a succeeded update into a
        // reported failure.
        console.warn('nsupdate warning:', stderr);
      }
    } finally {
      await unlink(keyFile).catch(() => undefined);
    }
  }

  private async createNSUpdateFile(zone: string, record: DNSRecord, keyConfig: ZoneConfig, isDelete = false): Promise<string> {
    if (!isValidZoneName(zone)) {
      throw new Error(`Invalid zone name: ${zone}`);
    }
    this.assertSafeRecord(record);
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
      const rdata = this.formatRdata(record);
      return `update delete ${record.name} ${record.type} ${rdata}`;
    })();

    const addCommand = `update add ${record.name} ${record.ttl} ${record.class || 'IN'} ${record.type} ${this.formatRdata(record)}`;

    const commands = [
      `server ${keyConfig.server}`,
      `zone ${zone}`,
      isDelete ? deleteCommand : addCommand,
      'send'
    ];

    const fileContent = commands.join('\n');

    await writeFile(updateFile, fileContent);
    return updateFile;
  }

  /**
   * Format a record's value as nsupdate presentation RDATA. Shared by add,
   * delete and update so all three quote/serialize a value identically (a value
   * must round-trip byte-for-byte for delete/prereq matching to work).
   */
  private formatRdata(rec: DNSRecord): string {
    if (rec.value === undefined || rec.value === null || rec.value === '') {
      throw new Error(`Record value is empty for ${rec.name} ${rec.type}`);
    }
    // TXT is the only type whose rdata is presentation-quoted; the value here is
    // the raw logical value (string) or already-chunked ≤255-byte segments.
    if (rec.type === 'TXT') {
      return quoteTxtValue(rec.value as string | string[]);
    }
    // Objects are SOA structures (arrays only occur for TXT, handled above).
    if (typeof rec.value === 'object') {
      return this.formatSOA(rec.value);
    }
    return String(rec.value);
  }

  private formatSOA(soa: any): string {
    // Coerce each numeric field, preserving a legitimate 0 (e.g. serial 0) and
    // never emitting a literal "NaN" into the nsupdate file.
    const num = (v: any, fallback: number): number => {
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    };
    return `${soa.mname} ${soa.rname} ${num(soa.serial, 0)} ${num(soa.refresh, 3600)} ` +
           `${num(soa.retry, 1800)} ${num(soa.expire, 604800)} ${num(soa.minimum, 86400)}`;
  }

  private parseSOA(value: string): any {
    const [mname, rname, serial, refresh, retry, expire, minimum] = value.split(/\s+/);
    return {
      mname: mname.toLowerCase().replace(/\.+$/, ''),
      rname: rname.toLowerCase().replace(/\.+$/, ''),
      serial: parseInt(serial) || 0,
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
        // record.data is already the raw, unquoted logical value (parseTxtRdata).
        value = record.data;
        break;
      case 'CNAME':
      case 'NS':
      case 'PTR':
      case 'DNAME':
        // Single domain-name rdata: names are case-insensitive (RFC 4343), so
        // canonicalise to lowercase without a trailing dot.
        if (typeof value === 'string') {
          value = value.toLowerCase().replace(/\.+$/, '');
        }
        break;
      default:
        // Every other type (A/AAAA, CAA, SSHFP, DNSKEY/RRSIG/DS, NAPTR, TLSA,
        // unknown types) carries case-sensitive rdata — base64 and hex in DNSSEC
        // records especially. Pass it through verbatim; lowercasing corrupted
        // signatures and keys.
        break;
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
      if (!isValidZoneName(zone)) {
        throw new Error(`Invalid zone name: ${zone}`);
      }
      this.validateKeyConfig(keyConfig);

      // Set a reasonable buffer size limit for child_process
      const maxBuffer = ZONE_TRANSFER_CONFIG.maxOutputSize;

      // Pass the TSIG secret via a 0600 key file (-k), not on the command line.
      const keyFile = await this.writeKeyFile(keyConfig);
      let stdout: string;
      let stderr: string;
      try {
        ({ stdout, stderr } = await execFileAsync(
          'dig',
          [`@${keyConfig.server}`, zone, 'AXFR', '-k', keyFile],
          { maxBuffer }
        ));
      } finally {
        await unlink(keyFile).catch(() => undefined);
      }

      if (stderr) {
        console.error('dig error:', stderr);
      }

      // A refused or failed transfer can still exit 0, emitting only comment
      // lines (e.g. "; Transfer failed."). Those are filtered out below, so a
      // failure would otherwise look like an empty zone — surface it instead.
      // Only comment (;) lines are inspected so record data that happens to
      // contain these words can't trigger a false failure.
      const transferFailed = stdout.split('\n').some(line =>
        line.startsWith(';') &&
        /transfer failed|communications error|connection timed out|no servers could be reached|couldn't get address/i.test(line)
      );
      if (transferFailed) {
        throw new Error(`Zone transfer for ${zone} failed (see server logs)`);
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
          // Split into the fixed leading columns plus the RDATA remainder, so
          // RDATA keeps its original spacing (quoted TXT strings can contain
          // significant whitespace that a naive /\s+/ split would collapse).
          const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*)$/);
          if (!match) {
            skippedCount++;
            continue;
          }
          const [, name, ttl, recordClass, type, rdata] = match;
          const data = rdata.split(/\s+/);

          // Skip TSIG records - they're ephemeral authentication signatures, not real DNS records
          if (type === 'TSIG') {
            skippedCount++;
            continue;
          }

          // Create a DNS packet record
          const packetRecord = {
            name,
            ttl: parseInt(ttl),
            class: recordClass,
            type,
            data: type === 'SOA' ? this.parseSOA(rdata) :
                  type === 'MX' ? { preference: parseInt(data[0]), exchange: data[1] } :
                  type === 'SRV' ? {
                    priority: parseInt(data[0]),
                    weight: parseInt(data[1]),
                    port: parseInt(data[2]),
                    target: data[3]
                  } :
                  // TXT: strip presentation quoting to the raw logical value.
                  type === 'TXT' ? parseTxtRdata(rdata) :
                  rdata
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

      // RFC 5936: a complete AXFR begins and ends with the zone's SOA. Absence
      // of an SOA means the response was not a valid/complete transfer (refused,
      // truncated, or wrong server) rather than a genuinely empty zone.
      if (!records.some(r => r.type === 'SOA')) {
        throw new Error(`Zone transfer for ${zone} was incomplete (no SOA record received)`);
      }

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
      // Reject injection payloads before any command runs
      this.assertSafeRecord(record);

      // No pre-add zone transfer / duplicate check: adding an RR identical to
      // one already present is an idempotent no-op server-side (RFC 2136
      // §3.4.2.2), and the previous string-equality check never matched
      // normalized vs. formatted values anyway while costing a full AXFR.
      const updateFile = await this.createNSUpdateFile(zone, record, keyConfig);

      try {
        await this.runNsupdate(updateFile, keyConfig);
        return { success: true, message: 'Record added successfully' };
      } finally {
        // Clean up the temporary file
        await unlink(updateFile).catch(console.error);
      }
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error('Unknown error occurred');
    }
  }

  async deleteRecord(zone: string, record: DNSRecord, keyConfig: ZoneConfig): Promise<ZoneOperationResult> {
    try {
      // Prevent SOA deletion - every zone must have exactly one SOA record
      if (record.type === 'SOA') {
        throw new Error('SOA records cannot be deleted. Every zone must have exactly one SOA record. Use the edit function to modify SOA fields.');
      }

      // Reject injection payloads before any command runs
      this.assertSafeRecord(record);

      const updateFile = await this.createNSUpdateFile(zone, record, keyConfig, true);

      try {
        await this.runNsupdate(updateFile, keyConfig);
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
    if (!isValidZoneName(zone)) {
      throw new Error(`Invalid zone name: ${zone}`);
    }
    this.assertSafeRecord(oldRecord);
    this.assertSafeRecord(newRecord);

    await this.initialize();
    const updateFile = join(this.getTempDir(), `update-${Date.now()}-${Math.random()}.txt`);

    try {
      // Special handling for SOA records
      if (newRecord.type === 'SOA') {
        // Auto-increment serial number
        const oldSOA = oldRecord.value as any;
        const newSOA = newRecord.value as any;

        // Ensure serial increments
        if (typeof newSOA.serial === 'number' && newSOA.serial <= oldSOA.serial) {
          newSOA.serial = oldSOA.serial + 1;
        }

        // For SOA, delete the entire RRset and add the new one atomically
        const deleteCommand = `update delete ${oldRecord.name} ${oldRecord.type}`;
        const addCommand = `update add ${newRecord.name} ${newRecord.ttl} ${newRecord.class || 'IN'} ${newRecord.type} ${this.formatSOA(newSOA)}`;

        const commands = [
          `server ${keyConfig.server}`,
          `zone ${zone}`,
          deleteCommand,
          addCommand,
          'send'
        ];

        const fileContent = commands.join('\n');

        await writeFile(updateFile, fileContent);
      } else {
        // Standard record update (non-SOA). Use formatRdata so TXT/SOA/array
        // values are serialized identically to add/delete.
        const hasOldData = oldRecord.value !== undefined && oldRecord.value !== null && oldRecord.value !== '';

        // Require the record being replaced to exist as given, so a value
        // mismatch fails the whole transaction loudly (NXRRSET) instead of
        // silently deleting nothing and adding a duplicate (RFC 2136 §2.4.1).
        const prereqCommand = hasOldData
          ? `prereq yxrrset ${oldRecord.name} ${oldRecord.type} ${this.formatRdata(oldRecord)}`
          : `prereq yxrrset ${oldRecord.name} ${oldRecord.type}`;

        const deleteCommand = hasOldData
          ? `update delete ${oldRecord.name} ${oldRecord.type} ${this.formatRdata(oldRecord)}`
          : `update delete ${oldRecord.name} ${oldRecord.type}`;

        const addCommand = `update add ${newRecord.name} ${newRecord.ttl} ${newRecord.class || 'IN'} ${newRecord.type} ${this.formatRdata(newRecord)}`;

        // Single atomic transaction: prerequisite + delete + add in one send.
        const commands = [
          `server ${keyConfig.server}`,
          `zone ${zone}`,
          prereqCommand,
          deleteCommand,
          addCommand,
          'send'
        ];

        await writeFile(updateFile, commands.join('\n'));
      }

      try {
        await this.runNsupdate(updateFile, keyConfig);
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