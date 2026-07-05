// src/context/__tests__/ConfigContext.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ConfigProvider, useConfig } from '../ConfigContext';

// Unauthenticated keeps the provider off the network entirely: no webhook
// config fetch on mount and no webhook PUT on updateConfig, so these tests
// exercise only the localStorage behavior under test.
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false })
}));

const STORAGE_KEY = 'dns_manager_config';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ConfigProvider>{children}</ConfigProvider>
);

describe('ConfigContext localStorage scrub', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('deletes a legacy keys array (with secret material) on mount and preserves other fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      defaultTTL: 7200,
      rowsPerPage: 25,
      keys: [
        {
          id: 'legacy-1',
          name: 'Legacy Key',
          keyName: 'legacy.example.com.',
          algorithm: 'hmac-sha256',
          keyValue: 'LEGACY-TSIG-SECRET=='
        }
      ]
    }));

    const { result } = renderHook(() => useConfig(), { wrapper });

    const raw = localStorage.getItem(STORAGE_KEY)!;
    expect(raw).not.toContain('LEGACY-TSIG-SECRET');
    expect(JSON.parse(raw)).toEqual({ defaultTTL: 7200, rowsPerPage: 25 });
    expect(JSON.parse(raw)).not.toHaveProperty('keys');

    // The exposed config keeps the surviving fields and never carries keys.
    expect(result.current.config.defaultTTL).toBe(7200);
    expect(result.current.config.rowsPerPage).toBe(25);
    expect(result.current.config).not.toHaveProperty('keys');
  });

  it('leaves localStorage untouched on mount when no legacy keys entry exists', () => {
    const stored = JSON.stringify({ defaultTTL: 7200, rowsPerPage: 25 });
    localStorage.setItem(STORAGE_KEY, stored);

    renderHook(() => useConfig(), { wrapper });

    // No scrub needed, so the raw value is not rewritten.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
  });

  it('never writes keys (or webhook fields) back via updateConfig after a scrub', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      defaultTTL: 7200,
      keys: [{ name: 'Legacy Key', keyValue: 'LEGACY-TSIG-SECRET==' }]
    }));

    const { result } = renderHook(() => useConfig(), { wrapper });

    await act(async () => {
      await result.current.updateConfig({
        defaultTTL: 300,
        rowsPerPage: 5,
        webhookUrl: 'https://hooks.example.com/x',
        webhookProvider: 'slack'
      });
    });

    const written = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(written).toEqual({ defaultTTL: 300, rowsPerPage: 5 });
    expect(written).not.toHaveProperty('keys');
    expect(written).not.toHaveProperty('webhookUrl');
    expect(written).not.toHaveProperty('webhookProvider');
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('LEGACY-TSIG-SECRET');

    // In-memory config still carries the webhook settings for consumers.
    expect(result.current.config.webhookUrl).toBe('https://hooks.example.com/x');
    expect(result.current.config.webhookProvider).toBe('slack');
  });

  it('falls back to defaults when the stored config is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current.config.defaultTTL).toBe(3600);
    consoleError.mockRestore();
  });
});
