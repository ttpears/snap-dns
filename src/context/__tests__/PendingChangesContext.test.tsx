// src/context/__tests__/PendingChangesContext.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { PendingChangesProvider, usePendingChanges } from '../PendingChangesContext';
import { NewPendingChange } from '../../types/dns';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PendingChangesProvider>{children}</PendingChangesProvider>
);

const makeChange = (value: string): NewPendingChange => ({
  type: 'ADD',
  zone: 'example.com',
  keyId: 'key-1',
  record: { name: 'www', type: 'A', value, ttl: 300 } as any
});

describe('PendingChangesContext id stamping', () => {
  it('stamps a unique id on every added change', () => {
    const { result } = renderHook(() => usePendingChanges(), { wrapper });

    act(() => {
      result.current.addPendingChange(makeChange('192.0.2.1'));
      result.current.addPendingChange(makeChange('192.0.2.2'));
    });

    const [first, second] = result.current.pendingChanges;
    expect(first.id).toEqual(expect.any(String));
    expect(second.id).toEqual(expect.any(String));
    expect(first.id).not.toEqual(second.id);
  });

  it('removes only the targeted change, not all changes added without ids', () => {
    // Regression: ADD/COPY changes used to be queued without ids, so removing
    // one filtered out every id-less change at once.
    const { result } = renderHook(() => usePendingChanges(), { wrapper });

    act(() => {
      result.current.addPendingChange(makeChange('192.0.2.1'));
      result.current.addPendingChange(makeChange('192.0.2.2'));
      result.current.addPendingChange(makeChange('192.0.2.3'));
    });

    const middleId = result.current.pendingChanges[1].id;
    act(() => {
      result.current.removePendingChange(middleId);
    });

    expect(result.current.pendingChanges).toHaveLength(2);
    expect(result.current.pendingChanges.map(c => (c.record as any).value)).toEqual([
      '192.0.2.1',
      '192.0.2.3'
    ]);
  });

  it('clearPendingChanges empties the queue and closes the drawer', () => {
    const { result } = renderHook(() => usePendingChanges(), { wrapper });

    act(() => {
      result.current.addPendingChange(makeChange('192.0.2.1'));
      result.current.setShowPendingDrawer(true);
    });
    act(() => {
      result.current.clearPendingChanges();
    });

    expect(result.current.pendingChanges).toHaveLength(0);
    expect(result.current.showPendingDrawer).toBe(false);
  });
});
