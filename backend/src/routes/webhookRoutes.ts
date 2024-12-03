import { Router, Request, Response } from 'express';
import { WebhookConfig, WebhookPayload } from '../types/webhook';
import { notificationService } from '../services';

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

    const result = await notificationService.send(config, payload);
    res.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to send webhook notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send webhook notification',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router; 