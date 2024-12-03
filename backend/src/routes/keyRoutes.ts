import { Router, Request, Response } from 'express';
import { DNSKey } from '../types/keys';
import { validateKey, loadKeys, saveKey } from '../services';

const router = Router();

interface KeyRequestBody {
  key: DNSKey;
}

// Get all keys
router.get('/', async (_req: Request, res: Response) => {
  try {
    const keys = await loadKeys();
    res.json({ success: true, keys });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to fetch keys:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch keys',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add new key
router.post('/', async (req: Request<{}, any, KeyRequestBody>, res: Response) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({ 
        success: false, 
        error: 'Key data is required' 
      });
    }

    const validationResult = await validateKey(key);
    if (!validationResult.success) {
      return res.status(400).json(validationResult);
    }

    const result = await saveKey(key);
    res.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to add key:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to add key',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 