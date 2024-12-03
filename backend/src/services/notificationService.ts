import { WebhookConfig, WebhookPayload, WebhookResponse } from '../types/webhook';

class NotificationService {
  async send(config: WebhookConfig, payload: WebhookPayload): Promise<WebhookResponse> {
    // Implementation here
    return { success: true };
  }
}

export const notificationService = new NotificationService(); 