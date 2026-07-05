// src/services/recordTypeHints.ts
// Format hints for a record type's single presentation-format value field,
// shared by the add form (AddDNSRecord) and the edit form (RecordEditor) so
// both show identical guidance. Multi-field types (MX, SRV, SOA) and TXT use
// dedicated editors and are not listed here.
export const VALUE_FIELD_HINTS: Record<string, string> = {
  A: 'Enter a valid IPv4 address (e.g., 192.168.1.1)',
  AAAA: 'Enter a valid IPv6 address',
  CNAME: 'Fully qualified domain name (FQDN) ending with a dot',
  NS: 'Fully qualified domain name of the authoritative nameserver',
  PTR: 'Fully qualified domain name (FQDN) ending with a dot',
  CAA: 'flags tag value — e.g. 0 issue "letsencrypt.org"',
  SSHFP: 'algorithm fingerprint-type fingerprint (hex) — e.g. 4 2 abcdef...',
  DS: 'key-tag algorithm digest-type digest — e.g. 12345 8 2 49FD46E6C4B4...',
  DNSKEY: 'flags protocol algorithm public-key (base64) — protocol is always 3; e.g. 257 3 13 mdsswUyr...',
  CDS: 'key-tag algorithm digest-type digest',
  CDNSKEY: 'flags protocol algorithm public-key (base64) — protocol is always 3; e.g. 257 3 13 mdsswUyr...',
  TLSA: 'usage selector matching-type certificate-data (hex)',
  SMIMEA: 'usage selector matching-type certificate-data (hex)',
  NAPTR: 'order preference "flags" "service" "regexp" replacement — e.g. 100 10 "S" "SIP+D2U" "" _sip._udp.example.com.',
  SVCB: 'priority target [key=value ...] — e.g. 1 . alpn=h2,h3 port=443; priority 0 = AliasMode (no params)',
  HTTPS: 'priority target [key=value ...] — e.g. 1 . alpn=h2,h3; priority 0 = AliasMode (no params)',
  DNAME: 'Target domain (FQDN ending with a dot)',
  LOC: 'geographic location — e.g. 52 22 23.000 N 4 53 32.000 E 2.00m',
  CERT: 'type key-tag algorithm certificate (base64)',
  URI: 'priority weight "target-uri"',
  KX: 'preference exchanger (FQDN)',
};

// Types managed as an opaque presentation-format value (no bespoke add-form
// fields). Used to generate their AddDNSRecord picker entries.
export const GENERIC_VALUE_TYPES = [
  'DS', 'DNSKEY', 'CDS', 'CDNSKEY', 'TLSA', 'SMIMEA', 'NAPTR', 'SVCB', 'HTTPS',
  'DNAME', 'LOC', 'CERT', 'URI', 'KX',
] as const;

// Generic RDATA hint for RFC 3597 unknown TYPE#### records.
export const RFC3597_VALUE_HINT =
  '\\# <length> <hex> — RFC 3597 generic RDATA, e.g. \\# 4 0A000001 (\\# 0 for empty)';

// Value-field hint lookup that also covers RFC 3597 unknown types, which
// cannot be enumerated in VALUE_FIELD_HINTS.
export function getValueFieldHint(type: string): string | undefined {
  if (/^TYPE\d+$/.test(type)) return RFC3597_VALUE_HINT;
  return VALUE_FIELD_HINTS[type];
}
