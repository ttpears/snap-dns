// backend/src/helpers/zoneAccess.ts
// Shared zone-access check used by both the zone routes and the backup routes.
//
// Privileges are read from the DB on each request so changes take effect without
// a re-login. Deny-by-default: a non-admin with no allowedZones may access no
// zone (consistent with allowedKeyIds). Admins bypass the gate entirely.

import { userService } from '../services/userService';

export async function checkZoneAccess(
  user: { role: string; userId: string },
  zone: string
): Promise<boolean> {
  if (user.role === 'admin') return true;
  const dbUser = await userService.getUserById(user.userId);
  if (!dbUser) return false;
  return dbUser.allowedZones.some(z => z.toLowerCase() === zone.toLowerCase());
}
