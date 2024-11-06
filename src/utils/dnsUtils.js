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
  return record.type === 'SOA' || (record.value && record.value.includes('\n'));
}

export function formatMultilineValue(value) {
  if (!value) return '';
  return value.split('\n')
    .map(line => line.trim())
    .filter(line => line)
    .join('\n');
} 