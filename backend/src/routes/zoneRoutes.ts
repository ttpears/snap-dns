import { Router, Request, Response } from 'express';
import { DNSRecord, ZoneConfig } from '../types/dns';
import { dnsService } from '../services';

const router = Router();

interface ZoneRequestBody {
  record?: DNSRecord;
  keyConfig: ZoneConfig;
}

interface ZoneParams {
  zone: string;
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

// Get zone records
router.get<ZoneParams, any, any, any>('/:zone', async (req, res) => {
  try {
    const { zone } = req.params;
    const keyConfig: ZoneConfig = {
      server: req.headers['x-dns-server'] as string,
      keyName: req.headers['x-dns-key-name'] as string,
      keyValue: req.headers['x-dns-key-value'] as string,
      algorithm: req.headers['x-dns-algorithm'] as string,
      id: req.headers['x-dns-key-id'] as string
    };

    if (!keyConfig.server || !keyConfig.keyName || !keyConfig.keyValue || !keyConfig.algorithm) {
      console.error('Missing DNS configuration:', {
        server: !!keyConfig.server,
        keyName: !!keyConfig.keyName,
        keyValue: !!keyConfig.keyValue,
        algorithm: !!keyConfig.algorithm,
        headers: req.headers
      });
      return res.status(400).json({
        success: false,
        code: ErrorCodes.MISSING_CONFIG,
        error: 'Missing required DNS configuration in headers',
        details: {
          missingFields: [
            !keyConfig.server && 'server',
            !keyConfig.keyName && 'keyName',
            !keyConfig.keyValue && 'keyValue',
            !keyConfig.algorithm && 'algorithm'
          ].filter(Boolean)
        }
      });
    }

    console.log('Fetching records for zone:', zone, 'with config:', {
      server: keyConfig.server,
      keyName: keyConfig.keyName,
      algorithm: keyConfig.algorithm,
      id: keyConfig.id
    });

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

// Add record to zone
router.post<ZoneParams, any, ZoneRequestBody>('/:zone/records', async (req, res) => {
  try {
    const { zone } = req.params;
    const { record, keyConfig } = req.body;

    if (!record || !keyConfig) {
      return res.status(400).json({ 
        success: false, 
        code: ErrorCodes.MISSING_CONFIG,
        error: 'Record data and key configuration are required',
        details: { missingFields: !record ? ['record'] : ['keyConfig'] }
      });
    }

    const result = await dnsService.addRecord(zone, record, keyConfig);
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

// Delete record from zone
router.delete<ZoneParams, any, ZoneRequestBody>('/:zone/records', async (req, res) => {
  try {
    const { zone } = req.params;
    const { record, keyConfig } = req.body;

    if (!record || !keyConfig) {
      return res.status(400).json({ 
        success: false, 
        code: ErrorCodes.MISSING_CONFIG,
        error: 'Record data and key configuration are required',
        details: { missingFields: !record ? ['record'] : ['keyConfig'] }
      });
    }

    const result = await dnsService.deleteRecord(zone, record, keyConfig);
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

export default router; 