// src/context/__tests__/KeyContext.test.tsx
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { KeyProvider, useKey } from '../KeyContext';

// Keys come exclusively from the backend TSIG key API; there is no
// localStorage fallback. The service is mocked per test.
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true })
}));

const mockListKeys = jest.fn();

jest.mock('../../services/tsigKeyService', () => ({
  tsigKeyService: { listKeys: (...args: unknown[]) => mockListKeys(...args) }
}));

const mockKeyA = {
  id: 'key-a',
  name: 'Key A',
  server: 'ns1.example.com',
  keyName: 'key-a',
  algorithm: 'hmac-sha256',
  zones: ['example.com', 'shared.com']
};

const mockKeyB = {
  id: 'key-b',
  name: 'Key B',
  server: 'ns2.example.com',
  keyName: 'key-b',
  algorithm: 'hmac-sha256',
  zones: ['other.org', 'shared.com']
};

const STORAGE_KEY = 'dns_manager_selections';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <KeyProvider>{children}</KeyProvider>
);

// Render the hook and wait for the mocked backend fetch to populate keys.
async function renderReadyHook() {
  const rendered = renderHook(() => useKey(), { wrapper });
  await waitFor(() => {
    expect(rendered.result.current.availableKeys).toHaveLength(2);
  });
  return rendered;
}

describe('KeyContext selection transitions', () => {
  beforeEach(() => {
    localStorage.clear();
    mockListKeys.mockReset();
    mockListKeys.mockResolvedValue([mockKeyA, mockKeyB]);
  });

  it('lists all zones across all keys when no key is selected', async () => {
    const { result } = await renderReadyHook();

    expect(result.current.selectedKey).toBeNull();
    expect(result.current.availableZones.sort()).toEqual([
      'example.com',
      'other.org',
      'shared.com'
    ]);
  });

  it('exposes key metadata without any secret material', async () => {
    const { result } = await renderReadyHook();

    result.current.availableKeys.forEach((key) => {
      expect(key).not.toHaveProperty('secret');
      expect(key).not.toHaveProperty('keyValue');
    });
  });

  it('has no keys or zones when the backend fetch fails (no local fallback)', async () => {
    mockListKeys.mockRejectedValue(new Error('backend unreachable'));

    const { result } = renderHook(() => useKey(), { wrapper });

    await waitFor(() => {
      expect(mockListKeys).toHaveBeenCalled();
    });
    expect(result.current.availableKeys).toEqual([]);
    expect(result.current.availableZones).toEqual([]);
  });

  it('keeps the selected zone when switching to a key that serves it', async () => {
    const { result } = await renderReadyHook();

    act(() => {
      result.current.selectKey(result.current.availableKeys[0]);
      result.current.selectZone('shared.com');
    });
    act(() => {
      result.current.selectKey(result.current.availableKeys[1]);
    });

    expect(result.current.selectedKey?.id).toBe('key-b');
    expect(result.current.selectedZone).toBe('shared.com');
  });

  it('clears the zone only when the new key does not serve it', async () => {
    const { result } = await renderReadyHook();

    act(() => {
      result.current.selectKey(result.current.availableKeys[0]);
      result.current.selectZone('example.com');
    });
    act(() => {
      result.current.selectKey(result.current.availableKeys[1]);
    });

    expect(result.current.selectedKey?.id).toBe('key-b');
    expect(result.current.selectedZone).toBeNull();
  });

  it('auto-selects a serving key on zone-first selection', async () => {
    const { result } = await renderReadyHook();

    act(() => {
      result.current.selectZone('other.org');
    });

    expect(result.current.selectedZone).toBe('other.org');
    expect(result.current.selectedKey?.id).toBe('key-b');
  });

  it('keeps the current key when it serves the newly selected zone', async () => {
    const { result } = await renderReadyHook();

    act(() => {
      result.current.selectKey(result.current.availableKeys[1]);
    });
    act(() => {
      result.current.selectZone('shared.com');
    });

    // key-a also serves shared.com but the already-selected key-b must win
    expect(result.current.selectedKey?.id).toBe('key-b');
    expect(result.current.selectedZone).toBe('shared.com');
  });

  it('keeps the zone when the key is deselected', async () => {
    const { result } = await renderReadyHook();

    act(() => {
      result.current.selectZone('example.com');
    });
    act(() => {
      result.current.selectKey(null);
    });

    expect(result.current.selectedKey).toBeNull();
    expect(result.current.selectedZone).toBe('example.com');
  });

  it('persists selections with the { keyId, zone } shape', async () => {
    const { result } = await renderReadyHook();

    act(() => {
      result.current.selectZone('shared.com');
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      keyId: 'key-a',
      zone: 'shared.com'
    });
  });

  it('restores a persisted key and zone on mount', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ keyId: 'key-b', zone: 'other.org' })
    );

    const { result } = await renderReadyHook();

    await waitFor(() => {
      expect(result.current.selectedKey?.id).toBe('key-b');
    });
    expect(result.current.selectedZone).toBe('other.org');
  });

  it('reports keysLoading until the backend fetch settles, then exposes keys', async () => {
    const { result } = renderHook(() => useKey(), { wrapper });

    // Before the fetch resolves the context must say "loading", not "no keys",
    // so consumers don't flash an empty state at users who have keys.
    expect(result.current.keysLoading).toBe(true);
    expect(result.current.availableKeys).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.keysLoading).toBe(false);
    });
    expect(result.current.availableKeys).toHaveLength(2);
  });

  it('clears keysLoading even when the backend fetch fails', async () => {
    mockListKeys.mockRejectedValueOnce(new Error('backend down'));
    const { result } = renderHook(() => useKey(), { wrapper });

    await waitFor(() => {
      expect(result.current.keysLoading).toBe(false);
    });
    expect(result.current.availableKeys).toHaveLength(0);
  });
});
