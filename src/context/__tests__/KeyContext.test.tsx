// src/context/__tests__/KeyContext.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { KeyProvider, useKey } from '../KeyContext';

// Keys come from ConfigContext (backend fetch is skipped when unauthenticated),
// so the provider resolves availableKeys synchronously in tests.
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false })
}));

jest.mock('../../services/tsigKeyService', () => ({
  tsigKeyService: { listKeys: jest.fn().mockResolvedValue([]) }
}));

const mockKeyA = {
  id: 'key-a',
  name: 'Key A',
  server: 'ns1.example.com',
  keyName: 'key-a',
  keyValue: 'secret-a',
  algorithm: 'hmac-sha256',
  zones: ['example.com', 'shared.com'],
  type: 'internal'
};

const mockKeyB = {
  id: 'key-b',
  name: 'Key B',
  server: 'ns2.example.com',
  keyName: 'key-b',
  keyValue: 'secret-b',
  algorithm: 'hmac-sha256',
  zones: ['other.org', 'shared.com'],
  type: 'internal'
};

jest.mock('../ConfigContext', () => ({
  useConfig: () => ({ config: { keys: [mockKeyA, mockKeyB] } })
}));

const STORAGE_KEY = 'dns_manager_selections';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <KeyProvider>{children}</KeyProvider>
);

describe('KeyContext selection transitions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists all zones across all keys when no key is selected', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

    expect(result.current.selectedKey).toBeNull();
    expect(result.current.availableZones.sort()).toEqual([
      'example.com',
      'other.org',
      'shared.com'
    ]);
  });

  it('keeps the selected zone when switching to a key that serves it', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

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

  it('clears the zone only when the new key does not serve it', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

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

  it('auto-selects a serving key on zone-first selection', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

    act(() => {
      result.current.selectZone('other.org');
    });

    expect(result.current.selectedZone).toBe('other.org');
    expect(result.current.selectedKey?.id).toBe('key-b');
  });

  it('keeps the current key when it serves the newly selected zone', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

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

  it('keeps the zone when the key is deselected', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

    act(() => {
      result.current.selectZone('example.com');
    });
    act(() => {
      result.current.selectKey(null);
    });

    expect(result.current.selectedKey).toBeNull();
    expect(result.current.selectedZone).toBe('example.com');
  });

  it('persists selections with the { keyId, zone } shape', () => {
    const { result } = renderHook(() => useKey(), { wrapper });

    act(() => {
      result.current.selectZone('shared.com');
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      keyId: 'key-a',
      zone: 'shared.com'
    });
  });

  it('restores a persisted key and zone on mount', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ keyId: 'key-b', zone: 'other.org' })
    );

    const { result } = renderHook(() => useKey(), { wrapper });

    expect(result.current.selectedKey?.id).toBe('key-b');
    expect(result.current.selectedZone).toBe('other.org');
  });
});
