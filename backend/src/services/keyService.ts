// backend/src/services/keyService.ts
import { DNSKey, KeyOperationResult } from '../types/keys';

class KeyService {
  async validateKey(_key: DNSKey): Promise<KeyOperationResult> {
    // Implementation here
    return { success: true };
  }

  async loadKeys(): Promise<DNSKey[]> {
    // Implementation here
    return [];
  }

  async saveKey(_key: DNSKey): Promise<KeyOperationResult> {
    // Implementation here
    return { success: true };
  }
}

export const { validateKey, loadKeys, saveKey } = new KeyService(); 