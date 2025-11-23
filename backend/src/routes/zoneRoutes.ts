import { Router, Request, Response } from 'express';
import { DNSRecord, ZoneConfig } from '../types/dns';
import { dnsService } from '../services';
import { requireAuth, requireWriteAccess } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { tsigKeyService } from '../services/tsigKeyService';
import { validationService } from '../services/validationService';
import { auditService } from '../services/auditService';
import { dnsQueryLimiter, dnsModifyLimiter } from '../middleware/rateLimiter';
import { validateAddRecord, validateDeleteRecord, validateUpdateRecord } from '../middleware/validation';

const router = Router();

interface ZoneRequestBody {
  record?: DNSRecord;
  keyConfig: ZoneConfig;
}

interface ZoneParams {
  zone: string;
  [key: string]: string;
}

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

// Get zone records - requires authentication and rate limiting
router.get('/:zone', dnsQueryLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;

    // For admins, get all key IDs; otherwise use the user's allowed keys
    let allowedKeyIds = user.allowedKeyIds;
    if (user.role === 'admin') {
      // Admins have access to all keys
      const allKeys = await tsigKeyService.listKeys();
      allowedKeyIds = allKeys.map(k => k.id);
    }

    // Fetch TSIG key from storage for this zone
    const tsigKey = await tsigKeyService.getKeyForZone(zone, user.userId, allowedKeyIds);

    if (!tsigKey) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'No TSIG key found for this zone. Please configure a key first.',
        details: { zone }
      });
    }

    // Build key config from stored key
    const keyConfig: ZoneConfig = {
      server: tsigKey.server,
      keyName: tsigKey.keyName,
      keyValue: tsigKey.keyValue, // Already decrypted
      algorithm: tsigKey.algorithm,
      id: tsigKey.id
    };

    console.log('Fetching records for zone:', zone, 'using stored key:', tsigKey.name);

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
  requireWriteAccess,
  validateAddRecord,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { record } = req.body;

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

    // For admins, get all key IDs; otherwise use the user's allowed keys
    let allowedKeyIds = user.allowedKeyIds;
    if (user.role === 'admin') {
      const allKeys = await tsigKeyService.listKeys();
      allowedKeyIds = allKeys.map(k => k.id);
    }

    // Fetch TSIG key from storage
    const tsigKey = await tsigKeyService.getKeyForZone(zone, user.userId, allowedKeyIds);

    if (!tsigKey) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'No TSIG key found for this zone',
        details: { zone }
      });
    }

    const keyConfig: ZoneConfig = {
      server: tsigKey.server,
      keyName: tsigKey.keyName,
      keyValue: tsigKey.keyValue,
      algorithm: tsigKey.algorithm,
      id: tsigKey.id
    };

    const result = await dnsService.addRecord(zone, record, keyConfig);

    // Log successful DNS operation
    await auditService.logDNSOperation('add', zone, record, user.userId, user.username, true);

    res.json(result);
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
  requireWriteAccess,
  validateDeleteRecord,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { record } = req.body;

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

    // For admins, get all key IDs; otherwise use the user's allowed keys
    let allowedKeyIds = user.allowedKeyIds;
    if (user.role === 'admin') {
      const allKeys = await tsigKeyService.listKeys();
      allowedKeyIds = allKeys.map(k => k.id);
    }

    // Fetch TSIG key from storage
    const tsigKey = await tsigKeyService.getKeyForZone(zone, user.userId, allowedKeyIds);

    if (!tsigKey) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'No TSIG key found for this zone',
        details: { zone }
      });
    }

    const keyConfig: ZoneConfig = {
      server: tsigKey.server,
      keyName: tsigKey.keyName,
      keyValue: tsigKey.keyValue,
      algorithm: tsigKey.algorithm,
      id: tsigKey.id
    };

    const result = await dnsService.deleteRecord(zone, record, keyConfig);

    // Log successful DNS operation
    await auditService.logDNSOperation('delete', zone, record, user.userId, user.username, true);

    res.json(result);
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
  requireWriteAccess,
  validateUpdateRecord,
  async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user!;
    const { zone } = req.params;
    const { oldRecord, newRecord } = req.body;

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

    // For admins, get all key IDs; otherwise use the user's allowed keys
    let allowedKeyIds = user.allowedKeyIds;
    if (user.role === 'admin') {
      const allKeys = await tsigKeyService.listKeys();
      allowedKeyIds = allKeys.map(k => k.id);
    }

    // Fetch TSIG key from storage
    const tsigKey = await tsigKeyService.getKeyForZone(zone, user.userId, allowedKeyIds);

    if (!tsigKey) {
      return res.status(403).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'No TSIG key found for this zone',
        details: { zone }
      });
    }

    const keyConfig: ZoneConfig = {
      server: tsigKey.server,
      keyName: tsigKey.keyName,
      keyValue: tsigKey.keyValue,
      algorithm: tsigKey.algorithm,
      id: tsigKey.id
    };

    // Use atomic update operation
    const result = await dnsService.updateRecord(zone, oldRecord, newRecord, keyConfig);

    // Log successful DNS operation
    await auditService.logDNSOperation(
      'update',
      zone,
      { old: oldRecord, new: newRecord },
      user.userId,
      user.username,
      true
    );

    res.json(result);
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

export default router; 