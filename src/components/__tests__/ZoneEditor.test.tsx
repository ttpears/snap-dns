// src/components/__tests__/ZoneEditor.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ZoneEditor from '../ZoneEditor';

jest.mock('../AddDNSRecord', () => ({ __esModule: true, default: () => null }));
jest.mock('../RecordEditor', () => ({ __esModule: true, default: () => null }));

jest.mock('../../services/dnsService', () => ({
  dnsService: {
    fetchZoneRecords: jest.fn().mockResolvedValue([])
  }
}));

jest.mock('../../context/ConfigContext', () => ({
  useConfig: () => ({ config: { keys: [] }, updateConfig: jest.fn() })
}));

jest.mock('../../context/PendingChangesContext', () => ({
  usePendingChanges: () => ({
    pendingChanges: [],
    setPendingChanges: jest.fn(),
    addPendingChange: jest.fn(),
    setShowPendingDrawer: jest.fn()
  })
}));

const mockUseKey = jest.fn();
jest.mock('../../context/KeyContext', () => ({
  useKey: () => mockUseKey()
}));

const renderEditor = () =>
  render(
    <MemoryRouter>
      <ZoneEditor />
    </MemoryRouter>
  );

describe('ZoneEditor onboarding states', () => {
  it('shows the no-keys empty state with a link to settings', () => {
    mockUseKey.mockReturnValue({
      selectedKey: null,
      selectedZone: null,
      availableZones: [],
      availableKeys: []
    });

    renderEditor();

    expect(screen.getByText('No TSIG keys configured')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /add a tsig key to get started/i });
    expect(link).toHaveAttribute('href', '/settings');
    // The regular editor chrome is not rendered without keys
    expect(screen.queryByPlaceholderText('Search records...')).not.toBeInTheDocument();
  });

  it('prompts for zone selection when keys exist but none is selected', () => {
    mockUseKey.mockReturnValue({
      selectedKey: null,
      selectedZone: null,
      availableZones: ['example.com'],
      availableKeys: [
        { id: 'key-1', name: 'key-1', server: 'ns1.example.com', zones: ['example.com'] }
      ]
    });

    renderEditor();

    expect(screen.getByText(/select a zone and tsig key/i)).toBeInTheDocument();
    expect(screen.queryByText('No TSIG keys configured')).not.toBeInTheDocument();
  });
});
