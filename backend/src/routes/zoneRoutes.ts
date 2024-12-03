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

// Get zone records
router.get<ZoneParams, any, any, any>('/:zone', async (req, res) => {
  try {
    const { zone } = req.params;
    // For GET requests, get keyConfig from query params or headers
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
        error: 'Missing required DNS configuration in headers'
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
    const error = err as Error;
    console.error('Failed to fetch zone records:', error);
    res.status(500).json({ 
      success: false, 
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
        error: 'Record data and key configuration are required' 
      });
    }

    const result = await dnsService.addRecord(zone, record, keyConfig);
    res.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to add record:', error);
    res.status(500).json({ 
      success: false, 
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
        error: 'Record data and key configuration are required' 
      });
    }

    const result = await dnsService.deleteRecord(zone, record, keyConfig);
    res.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to delete record:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete record',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 