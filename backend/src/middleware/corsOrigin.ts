// backend/src/middleware/corsOrigin.ts
// Origin allowlist logic for CORS, extracted from server.ts so it can be unit tested.

// Known development origins: CRA default (3000), the docker-compose dev/test
// frontend port (3001), and the container-internal frontend hostname.
export const DEV_DEFAULT_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://frontend:3001'
];

// Builds the effective origin allowlist for the given environment.
// Production uses ALLOWED_ORIGINS exclusively; development/test get the known
// dev origins plus anything in ALLOWED_ORIGINS.
export function getAllowedOrigins(nodeEnv: string, allowedOriginsEnv?: string): string[] {
  const fromEnv = allowedOriginsEnv?.split(',') || [];
  if (nodeEnv === 'production') {
    return fromEnv;
  }
  return [...new Set([...DEV_DEFAULT_ORIGINS, ...fromEnv])];
}

// Requests without an Origin header (curl, same-origin, server-to-server) are
// allowed; browser cross-origin requests must match the allowlist exactly.
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  return !origin || allowedOrigins.includes(origin);
}
