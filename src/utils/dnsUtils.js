/**
 * Properly qualifies a DNS name within a zone
 * @param {string} name - The record name to qualify
 * @param {string} zone - The DNS zone (e.g., "example.com")
 * @returns {string} - Fully qualified domain name with trailing dot
 */
export const qualifyDnsName = (name, zone) => {
  // Remove any trailing dots for consistent handling
  const cleanName = name.endsWith('.') ? name.slice(0, -1) : name;
  const cleanZone = zone.endsWith('.') ? zone.slice(0, -1) : zone;

  // If name is @ or empty, return zone with trailing dot
  if (name === '@' || name === '') {
    return `${cleanZone}.`;
  }

  // If name already contains the zone, strip it first
  if (cleanName.endsWith(cleanZone)) {
    const nameWithoutZone = cleanName.slice(0, -cleanZone.length - 1);
    return `${nameWithoutZone}.${cleanZone}.`;
  }

  // Simple name or subdomain, just append zone
  return `${cleanName}.${cleanZone}.`;
};

export function isMultilineRecord(record) {
  // SOA records are always multiline
  if (record.type === 'SOA') return true;
  
  // TXT records with quotes or exceeding certain length
  if (record.type === 'TXT' && (
    record.value.includes('"') || 
    record.value.includes('\n') || 
    record.value.length > 255
  )) return true;
  
  // MX records with preferences
  if (record.type === 'MX' && record.value.includes('\n')) return true;
  
  // SRV records are typically multiline
  if (record.type === 'SRV') return true;
  
  return false;
}

export function formatMultilineValue(record) {
  if (!record || !record.value) return '';
  
  switch (record.type) {
    case 'SOA':
      // Format: primary-ns admin-mailbox serial refresh retry expire minimum
      const [primary, admin, serial, refresh, retry, expire, minimum] = record.value.split(/\s+/);
      return `${primary}\n${admin}\n${serial}\n${refresh}\n${retry}\n${expire}\n${minimum}`;
    
    case 'TXT':
      // Handle quoted strings and long TXT records
      return record.value.split(/(?<="})\s+(?=")/).join('\n');
    
    case 'MX':
      // Format: preference exchange
      return record.value.split(/\s+(?=\d+\s)/).join('\n');
    
    case 'SRV':
      // Format: priority weight port target
      const [priority, weight, port, target] = record.value.split(/\s+/);
      return `${priority} ${weight}\n${port} ${target}`;
    
    default:
      return record.value;
  }
} 