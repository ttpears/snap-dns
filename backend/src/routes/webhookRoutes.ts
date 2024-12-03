import { Router, Request, Response } from 'express';
import { WebhookConfig, WebhookPayload } from '../types/webhook';
import { webhookService } from '../services/webhookService';

const router = Router();

interface WebhookRequestBody {
  config: WebhookConfig;
  payload: WebhookPayload;
}

router.post('/notify', async (req: Request<{}, any, WebhookRequestBody>, res: Response) => {
  try {
    const { config, payload } = req.body;

    if (!config || !payload) {
      return res.status(400).json({
        success: false,
        error: 'Webhook configuration and payload are required'
      });
    }

    console.log('Processing webhook request:', {
      provider: config.provider,
      payload: payload
    });

    const result = await webhookService.send(config, payload);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to send webhook notification:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send webhook notification',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 