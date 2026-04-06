// src/utils/dnsUtils.ts
export const qualifyDnsName = (name: string, zone: string): string => {
  const cleanName = name.endsWith('.') ? name.slice(0, -1) : name;
  const cleanZone = zone.endsWith('.') ? zone.slice(0, -1) : zone;

  if (name === '@' || name === '') {
    return `${cleanZone}.`;
  }

  if (cleanName.endsWith(cleanZone)) {
    const nameWithoutZone = cleanName.slice(0, -cleanZone.length - 1);
    return `${nameWithoutZone}.${cleanZone}.`;
  }

  return `${cleanName}.${cleanZone}.`;
};
