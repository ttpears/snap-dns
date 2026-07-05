// src/components/__tests__/PendingChangesDrawer.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PendingChangesDrawer from '../PendingChangesDrawer';
import { PendingChangesProvider, usePendingChanges } from '../../context/PendingChangesContext';
import { NewPendingChange } from '../../types/dns';
import { dnsService } from '../../services/dnsService';
import { notificationService } from '../../services/notificationService';

jest.mock('../../services/dnsService', () => ({
  dnsService: {
    fetchZoneRecords: jest.fn().mockResolvedValue([]),
    applyBatch: jest.fn()
  }
}));

jest.mock('../../services/backupService', () => ({
  backupService: {
    createBackup: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    sendNotification: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../services/tsigKeyService', () => ({
  tsigKeyService: {
    listKeys: jest.fn().mockResolvedValue([])
  }
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError })
}));

jest.mock('../../context/ConfigContext', () => ({
  useConfig: () => ({ config: { keys: [] } })
}));

const applyBatch = dnsService.applyBatch as jest.Mock;

const addChange = (zone: string, value: string): NewPendingChange => ({
  type: 'ADD',
  zone,
  keyId: 'key-1',
  record: { name: 'www', type: 'A', value, ttl: 300 } as any
});

function Harness({ seed, onClose }: { seed: NewPendingChange[]; onClose: () => void }) {
  const ctx = usePendingChanges();
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      seed.forEach(ctx.addPendingChange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PendingChangesDrawer
      open
      onClose={onClose}
      removePendingChange={ctx.removePendingChange}
      clearPendingChanges={ctx.clearPendingChanges}
    />
  );
}

const renderDrawer = (seed: NewPendingChange[], onClose: () => void = jest.fn()) =>
  render(
    <PendingChangesProvider>
      <Harness seed={seed} onClose={onClose} />
    </PendingChangesProvider>
  );

const startApply = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));
  // Confirmation dialog opens; the confirm button states the change count.
  fireEvent.click(await screen.findByRole('button', { name: /^Apply \d+ change/ }));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PendingChangesDrawer apply flow', () => {
  it('requires confirmation before applying, and cancel applies nothing', async () => {
    renderDrawer([addChange('alpha.test', '192.0.2.1')]);

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }));
    expect(await screen.findByText('Apply changes to live DNS?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByText('Apply changes to live DNS?')).not.toBeInTheDocument()
    );
    expect(applyBatch).not.toHaveBeenCalled();
  });

  it('applies all zones, clears the queue and closes on full success', async () => {
    applyBatch.mockResolvedValue({});
    const onClose = jest.fn();
    renderDrawer(
      [addChange('alpha.test', '192.0.2.1'), addChange('beta.test', '192.0.2.2')],
      onClose
    );

    await startApply();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(applyBatch).toHaveBeenCalledTimes(2);
    expect(mockShowSuccess).toHaveBeenCalledWith('Successfully applied 2 changes to 2 zones');
    expect(notificationService.sendNotification).toHaveBeenCalledWith(
      'Multiple Zones',
      expect.objectContaining({ zones: ['alpha.test', 'beta.test'] })
    );
    expect(screen.getByText('Pending Changes (0)')).toBeInTheDocument();
  });

  it('keeps only the failed zone pending on partial failure', async () => {
    // alpha.test succeeds, beta.test fails: alpha's changes must leave the
    // queue (no double-apply on retry), beta's must remain with its error.
    applyBatch.mockImplementation((zone: string) =>
      zone === 'alpha.test'
        ? Promise.resolve({})
        : Promise.reject(new Error('update REFUSED'))
    );
    const onClose = jest.fn();
    renderDrawer(
      [addChange('alpha.test', '192.0.2.1'), addChange('beta.test', '192.0.2.2')],
      onClose
    );

    await startApply();

    expect(
      await screen.findByText('Some zones failed to apply. Their changes are still pending below.')
    ).toBeInTheDocument();
    expect(screen.getByText(/beta\.test \(1 change\): update REFUSED/)).toBeInTheDocument();

    // Applied zone's change was removed; failed zone's change remains.
    expect(screen.getByText('Pending Changes (1)')).toBeInTheDocument();
    expect(screen.getByText(/Zone: beta\.test/)).toBeInTheDocument();
    expect(screen.queryByText(/Zone: alpha\.test/)).not.toBeInTheDocument();

    expect(mockShowError).toHaveBeenCalledWith('Failed to apply changes to 1 zone');
    expect(mockShowSuccess).toHaveBeenCalledWith('Applied 1 change to 1 zone');
    // Single-zone applies name the zone in the webhook notification.
    expect(notificationService.sendNotification).toHaveBeenCalledWith(
      'alpha.test',
      expect.objectContaining({ zones: ['alpha.test'] })
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves everything pending when every zone fails', async () => {
    applyBatch.mockRejectedValue(new Error('SERVFAIL'));
    const onClose = jest.fn();
    renderDrawer([addChange('alpha.test', '192.0.2.1')], onClose);

    await startApply();

    expect(
      await screen.findByText('Some zones failed to apply. Their changes are still pending below.')
    ).toBeInTheDocument();
    expect(screen.getByText('Pending Changes (1)')).toBeInTheDocument();
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
