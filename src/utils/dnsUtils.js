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

  // If name already ends with the zone
  if (cleanName.endsWith(cleanZone)) {
    return `${cleanName}.`;
  }

  // If name contains dots, check if it's a valid subdomain
  if (cleanName.includes('.')) {
    const nameParts = cleanName.split('.');
    const zoneParts = cleanZone.split('.');
    
    // Check if the name ends with the zone
    const endsWithZone = zoneParts.every((part, index) => 
      nameParts[nameParts.length - zoneParts.length + index] === part
    );
    
    if (endsWithZone) {
      return `${cleanName}.`;
    }
  }

  // Simple name, prepend to zone
  return `${cleanName}.${cleanZone}.`;
}; 