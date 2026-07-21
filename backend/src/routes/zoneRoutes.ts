// backend/src/routes/zoneRoutes.ts
import { Router, Request, Response } from 'express';
import { ZoneConfig } from '../types/dns';
import { dnsService } from '../services';
import { requireAuth, requireWriteAccess, requirePasswordCurrent } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { tsigKeyService } from '../services/tsigKeyService';
import { validationService } from '../services/validationService';
import { auditService } from '../services/auditService';
import { dnsQueryLimiter, dnsModifyLimiter } from '../middleware/rateLimiter';
import { validateAddRecord, validateDeleteRecord, validateUpdateRecord, validateBatch } from '../middleware/validation';
import { BatchChange } from '../services/dnsService';
import { checkZoneAccess } from '../helpers/zoneAccess';

const router = Router();

// Add custom error types
interface DNSError extends Error {
  code?: ErrorCode;
  details?: any;
  status?: number;
}

// Add error codes
const ErrorCodes = {
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  INVALID_RECORD: 'INVALID_RECORD',
  ZONE_NOT_FOUND: 'ZONE_NOT_FOUND',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  MISSING_CONFIG: 'MISSING_CONFIG',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR'
} as const;

// Add type for error codes
type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// Result of resolving the explicitly-selected TSIG key for a request.
type KeyResolution =
  | { ok: true; keyConfig: ZoneConfig }
  | { ok: false; status: number; code: ErrorCode; error: string; details?: unknown };

// Resolve the TSIG key a request must use by its EXPLICIT keyId, never by zone
// name. In split-horizon DNS the same zone name exists under two keys (an
// internal and an external view); resolving by zone name alone silently picks
// whichever key sorts first, so an internal edit could land on the external
// server. Requiring keyId makes the target view unambiguous.
//
// Authorization order: the key must be in the caller's allowlist (admins may use
// any key), it must exist, and it must actually serve the requested zone (an
// empty zones list is a wildcard that serves any zone).
async function resolveZoneKey(
  user: { role: string; userId: string; allowedKeyIds: string[] },
  zone: string,
  keyId: unknown
): Promise<KeyResolution> {
  if (!keyId || typeof keyId !== 'string') {
    return {
      ok: false,
      status: 400,
      code: ErrorCodes.MISSING_CONFIG,
      error: 'A keyId is required to identify which TSIG key/view to use',
      details: { missingFields: ['keyId'] },
    };
  }

  let allowedKeyIds = user.allowedKeyIds;
  if (user.role === 'admin') {
    const allKeys = await tsigKeyService.listKeys();
    allowedKeyIds = allKeys.map(k => k.id);
  }
  if (!allowedKeyIds.includes(keyId)) {
    return {
      ok: false,
      status: 403,
      code: ErrorCodes.PERMISSION_DENIED,
      error: 'Access denied to the specified key',
      details: { keyId },
    };
  }

  const tsigKey = await tsigKeyService.getKey(keyId);
  if (!tsigKey) {
    return {
      ok: false,
      status: 404,
      code: ErrorCodes.MISSING_CONFIG,
      error: 'The specified TSIG key does not exist',
      details: { keyId },
    };
  }

  const servesZone = tsigKey.zones.length === 0 || tsigKey.zones.includes(zone);
  if (!servesZone) {
    return {
      ok: false,
      status: 400,
      code: ErrorCodes.MISSING_CONFIG,
      error: 'The selected key is not configured for this zone',
      details: { zone, keyId },
    };
  }

  return {
    ok: true,
    keyConfig: {
      server: tsigKey.server,
      keyName: tsigKey.keyName,
      keyValue: tsigKey.keyValue, // Already decrypted by getKey
      algorithm: tsigKey.algorithm,
      id: tsigKey.id,
    },
  };
}

// Get zone records - requires authentication and rate limiting
router.get('/:zone', dnsQueryLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;

    if (!await checkZoneAccess(user, zone)) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Access denied to this zone',
        details: { zone }
      });
    }

    // Resolve the key by the explicitly requested keyId (query param), so a
    // split-horizon zone is read from the exact view the user selected.
    const resolved = await resolveZoneKey(user, zone, req.query.keyId);
    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        details: resolved.details,
      });
    }
    const keyConfig = resolved.keyConfig;

    console.log('Fetching records for zone:', zone, 'using key id:', keyConfig.id);

    const records = await dnsService.fetchZoneRecords(zone, keyConfig);
    res.json({ success: true, records });
  } catch (err: unknown) {
    const error = err as DNSError;
    console.error('Failed to fetch zone records:', error);

    if (error.message?.includes('Zone not found')) {
      return res.status(404).json({
        success: false,
        code: ErrorCodes.ZONE_NOT_FOUND,
        error: 'The specified zone does not exist',
        details: { zone: req.params.zone }
      });
    }

    if (error.message?.includes('Permission denied')) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Insufficient permissions to access this zone',
        details: { zone: req.params.zone }
      });
    }

    res.status(500).json({ 
      success: false, 
      code: ErrorCodes.SERVER_ERROR,
      error: 'Failed to fetch zone records',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add record to zone - requires authentication, write access, rate limiting, and validation
router.post(
  '/:zone/records',
  dnsModifyLimiter,
  requireAuth,
  requirePasswordCurrent,
  requireWriteAccess,
  validateAddRecord,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { record } = req.body;

    if (!await checkZoneAccess(user, zone)) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Access denied to this zone',
        details: { zone }
      });
    }

    if (!record) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'Record data is required',
        details: { missingFields: ['record'] }
      });
    }

    // Validate record on backend (don't trust frontend)
    const validation = validationService.validateRecord(record, zone);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        error: 'Invalid DNS record',
        details: { errors: validation.errors }
      });
    }

    // Resolve the key by the explicitly requested keyId (request body), so a
    // split-horizon zone is written to the exact view the user selected.
    const resolved = await resolveZoneKey(user, zone, req.body.keyId);
    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        details: resolved.details,
      });
    }
    const keyConfig = resolved.keyConfig;

    const result = await dnsService.addRecord(zone, record, keyConfig);

    // Log successful DNS operation
    await auditService.logDNSOperation('add', zone, record, user.userId, user.username, true);

    res.json({ ...result, warnings: validation.warnings });
  } catch (err: unknown) {
    const error = err as DNSError;
    console.error('Failed to add record:', error);

    // Handle specific error cases
    if (error.message?.includes('Record already exists')) {
      return res.status(409).json({
        success: false,
        code: ErrorCodes.DUPLICATE_RECORD,
        error: 'This record already exists in the zone',
        details: { record: req.body.record }
      });
    }

    if (error.message?.includes('Invalid record')) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.INVALID_RECORD,
        error: 'Invalid DNS record format',
        details: error.details || error.message
      });
    }

    res.status(500).json({ 
      success: false,
      code: ErrorCodes.SERVER_ERROR,
      error: 'Failed to add record',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete record from zone - requires authentication, write access, rate limiting, and validation
router.delete(
  '/:zone/records',
  dnsModifyLimiter,
  requireAuth,
  requirePasswordCurrent,
  requireWriteAccess,
  validateDeleteRecord,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { record } = req.body;

    if (!await checkZoneAccess(user, zone)) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Access denied to this zone',
        details: { zone }
      });
    }

    if (!record) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'Record data is required',
        details: { missingFields: ['record'] }
      });
    }

    // Validate record on backend (don't trust frontend)
    const validation = validationService.validateRecord(record, zone);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        error: 'Invalid DNS record',
        details: { errors: validation.errors }
      });
    }

    // Resolve the key by the explicitly requested keyId (request body), so a
    // split-horizon zone is written to the exact view the user selected.
    const resolved = await resolveZoneKey(user, zone, req.body.keyId);
    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        details: resolved.details,
      });
    }
    const keyConfig = resolved.keyConfig;

    const result = await dnsService.deleteRecord(zone, record, keyConfig);

    // Log successful DNS operation
    await auditService.logDNSOperation('delete', zone, record, user.userId, user.username, true);

    res.json({ ...result, warnings: validation.warnings });
  } catch (err: unknown) {
    const error = err as DNSError;
    console.error('Failed to delete record:', error);

    // Handle specific error cases
    if (error.message?.includes('Record not found')) {
      return res.status(404).json({
        success: false,
        code: ErrorCodes.RECORD_NOT_FOUND,
        error: 'The specified record does not exist in the zone',
        details: { record: req.body.record }
      });
    }

    if (error.message?.includes('Invalid record')) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.INVALID_RECORD,
        error: 'Invalid DNS record format',
        details: error.details || error.message
      });
    }

    if (error.message?.includes('Permission denied')) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Insufficient permissions to delete this record',
        details: error.details
      });
    }

    res.status(500).json({
      success: false,
      code: ErrorCodes.SERVER_ERROR,
      error: 'Failed to delete record',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update record in zone - requires authentication, write access, rate limiting, and validation
// This performs an atomic update using a single nsupdate transaction
router.patch(
  '/:zone/records',
  dnsModifyLimiter,
  requireAuth,
  requirePasswordCurrent,
  requireWriteAccess,
  validateUpdateRecord,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { oldRecord, newRecord } = req.body;

    if (!await checkZoneAccess(user, zone)) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Access denied to this zone',
        details: { zone }
      });
    }

    if (!oldRecord || !newRecord) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'Both oldRecord and newRecord are required',
        details: { missingFields: !oldRecord ? ['oldRecord'] : ['newRecord'] }
      });
    }

    // Validate both records on backend (don't trust frontend)
    const oldValidation = validationService.validateRecord(oldRecord, zone);
    if (!oldValidation.isValid) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        error: 'Invalid old DNS record',
        details: { errors: oldValidation.errors }
      });
    }

    const newValidation = validationService.validateRecord(newRecord, zone);
    if (!newValidation.isValid) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        error: 'Invalid new DNS record',
        details: { errors: newValidation.errors }
      });
    }

    // Resolve the key by the explicitly requested keyId (request body), so a
    // split-horizon zone is written to the exact view the user selected.
    const resolved = await resolveZoneKey(user, zone, req.body.keyId);
    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        details: resolved.details,
      });
    }
    const keyConfig = resolved.keyConfig;

    // Use atomic update operation
    const result = await dnsService.updateRecord(zone, oldRecord, newRecord, keyConfig);

    // Log successful DNS operation. Pass the new record (not a {old,new}
    // wrapper) so the audit entry carries the record name/type and a correct
    // valueLength, consistent with the add/delete entries.
    await auditService.logDNSOperation(
      'update',
      zone,
      newRecord,
      user.userId,
      user.username,
      true
    );

    res.json({ ...result, warnings: newValidation.warnings });
  } catch (err: unknown) {
    const error = err as DNSError;
    console.error('Failed to update record:', error);

    // Handle specific error cases
    if (error.message?.includes('Record not found')) {
      return res.status(404).json({
        success: false,
        code: ErrorCodes.RECORD_NOT_FOUND,
        error: 'The specified record does not exist in the zone',
        details: { record: req.body.oldRecord }
      });
    }

    if (error.message?.includes('Invalid record')) {
      return res.status(400).json({
        success: false,
        code: ErrorCodes.INVALID_RECORD,
        error: 'Invalid DNS record format',
        details: error.details || error.message
      });
    }

    if (error.message?.includes('Permission denied')) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Insufficient permissions to update this record',
        details: error.details
      });
    }

    res.status(500).json({
      success: false,
      code: ErrorCodes.SERVER_ERROR,
      error: 'Failed to update record',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Apply a batch of changes to a zone atomically (single nsupdate transaction).
// Used by the pending-changes apply / restore flow so a multi-record change is
// all-or-nothing rather than partially applied on failure.
router.post(
  '/:zone/records/batch',
  dnsModifyLimiter,
  requireAuth,
  requirePasswordCurrent,
  requireWriteAccess,
  validateBatch,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { changes } = req.body as { changes: BatchChange[] };

    if (!await checkZoneAccess(user, zone)) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.PERMISSION_DENIED,
        error: 'Access denied to this zone',
        details: { zone }
      });
    }

    // Validate every record in the batch on the backend (don't trust frontend).
    const allWarnings: string[] = [];
    for (const change of changes) {
      const records = change.op === 'update'
        ? [change.oldRecord, change.newRecord]
        : [change.record];
      for (const record of records) {
        if (!record) {
          return res.status(400).json({
            success: false,
            code: ErrorCodes.VALIDATION_ERROR,
            error: `Missing record for "${change.op}" change`,
            details: { change }
          });
        }
        const validation = validationService.validateRecord(record, zone);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            code: ErrorCodes.VALIDATION_ERROR,
            error: 'Invalid DNS record in batch',
            details: { errors: validation.errors, record }
          });
        }
        allWarnings.push(...validation.warnings);
      }
    }

    // Resolve the key by the explicitly requested keyId (request body). The
    // apply flow groups pending changes by (zone, keyId) and sends one batch per
    // group, so each split-horizon view is written through its own key.
    const resolved = await resolveZoneKey(user, zone, req.body.keyId);
    if (!resolved.ok) {
      return res.status(resolved.status).json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        details: resolved.details,
      });
    }
    const keyConfig = resolved.keyConfig;

    const result = await dnsService.applyBatch(zone, changes, keyConfig);

    // The transaction already committed to DNS. Audit-logging is best-effort:
    // a logging failure must not be reported to the client as if the DNS change
    // failed (which would prompt a confusing re-apply).
    try {
      for (const change of changes) {
        // For updates, audit the new record so the entry carries name/type/
        // valueLength (a {old,new} wrapper would log valueLength:0 with no name).
        const record = change.op === 'update' ? change.newRecord : change.record;
        await auditService.logDNSOperation(change.op, zone, record, user.userId, user.username, true);
      }
    } catch (auditErr) {
      console.error('Batch applied but audit logging failed:', auditErr);
    }

    res.json({ ...result, warnings: allWarnings });
  } catch (err: unknown) {
    const error = err as DNSError;
    console.error('Failed to apply batch:', error);
    res.status(500).json({
      success: false,
      code: ErrorCodes.SERVER_ERROR,
      error: 'Failed to apply changes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;