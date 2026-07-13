// src/components/__tests__/KeySelector.test.tsx
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import KeySelector from '../KeySelector';

const mockUseKey = jest.fn();
jest.mock('../../context/KeyContext', () => ({
  useKey: () => mockUseKey()
}));

const FORWARD = ['example.com', 'example.net'];
const reverseZones = (n: number) =>
  Array.from({ length: n }, (_, i) => `${i}.0.192.in-addr.arpa`);

function setup(overrides: Record<string, unknown> = {}) {
  const selectZone = jest.fn();
  mockUseKey.mockReturnValue({
    selectedKey: null,
    selectedZone: null,
    selectKey: jest.fn(),
    selectZone,
    availableKeys: [],
    availableZones: [],
    ...overrides
  });
  render(<KeySelector />);
  return { selectZone };
}

// Open a MUI Select identified by its accessible name and return a `within`
// scoped to the resulting listbox.
function openSelect(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }));
  return within(screen.getByRole('listbox'));
}

describe('KeySelector reverse-zone sub-selection', () => {
  beforeEach(() => mockUseKey.mockReset());

  it('lists reverse zones inline when there are 5 or fewer', () => {
    setup({ availableZones: [...FORWARD, ...reverseZones(5)] });

    const list = openSelect(/select zone/i);
    // Every reverse zone is a directly selectable option...
    expect(list.getByText('0.0.192.in-addr.arpa')).toBeInTheDocument();
    // ...and there is no "Reverse zones" sub-selection entry.
    expect(list.queryByText(/^reverse zones/i)).not.toBeInTheDocument();
  });

  it('collapses reverse zones behind a sub-selection entry when there are more than 5', () => {
    setup({ availableZones: [...FORWARD, ...reverseZones(6)] });

    const list = openSelect(/select zone/i);
    // Forward zones stay inline.
    expect(list.getByText('example.com')).toBeInTheDocument();
    // The reverse zones are no longer directly in the main list...
    expect(list.queryByText('0.0.192.in-addr.arpa')).not.toBeInTheDocument();
    // ...they live behind a single sub-selection entry.
    expect(list.getByText(/^reverse zones/i)).toBeInTheDocument();
  });

  it('reveals a second dropdown and selects a reverse zone through it', () => {
    const { selectZone } = setup({ availableZones: [...FORWARD, ...reverseZones(6)] });

    // Choose the sub-selection entry in the main dropdown.
    fireEvent.click(openSelect(/select zone/i).getByText(/^reverse zones/i));
    // Picking the entry alone must not commit a zone.
    expect(selectZone).not.toHaveBeenCalled();

    // A dedicated reverse-zone dropdown appears; pick a zone from it.
    fireEvent.click(openSelect(/reverse zone/i).getByText('3.0.192.in-addr.arpa'));
    expect(selectZone).toHaveBeenCalledWith('3.0.192.in-addr.arpa');
  });

  it('shows the sub-dropdown pre-selected when a reverse zone is already selected', () => {
    setup({
      availableZones: [...FORWARD, ...reverseZones(6)],
      selectedZone: '2.0.192.in-addr.arpa'
    });

    // The reverse-zone dropdown is rendered and reflects the current selection.
    const reverseTrigger = screen.getByRole('combobox', { name: /reverse zone/i });
    expect(within(reverseTrigger).getByText('2.0.192.in-addr.arpa')).toBeInTheDocument();
    // The main dropdown shows the sub-selection entry rather than a zone.
    expect(screen.getByRole('combobox', { name: /select zone/i })).toHaveTextContent(/reverse zones/i);
  });
});
