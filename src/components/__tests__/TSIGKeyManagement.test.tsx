// src/components/__tests__/TSIGKeyManagement.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import TSIGKeyManagement from '../TSIGKeyManagement';

// The component talks to the backend only through this API client, mocked per test.
const mockListKeys = jest.fn();
jest.mock('../../services/tsigKeyService', () => ({
  tsigKeyService: {
    listKeys: (...args: unknown[]) => mockListKeys(...args),
    createKey: jest.fn(),
    updateKey: jest.fn(),
    deleteKey: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'admin', role: 'admin' } }),
}));

jest.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}));

beforeEach(() => jest.clearAllMocks());

describe('TSIGKeyManagement — empty vs. load-error', () => {
  it('shows the empty state when there are genuinely no keys', async () => {
    mockListKeys.mockResolvedValue([]);
    render(<TSIGKeyManagement />);

    expect(await screen.findByText(/No TSIG keys configured/i)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn.t load TSIG keys/i)).not.toBeInTheDocument();
  });

  it('shows a reassuring load-error state (never the "no keys" wipe-looking state) when the fetch fails', async () => {
    // e.g. a 429 from the rate limiter, or any network/500 error.
    mockListKeys.mockRejectedValue(new Error('Failed to fetch TSIG keys'));
    render(<TSIGKeyManagement />);

    // The "wiped"-looking empty state must NOT appear...
    expect(await screen.findByText(/Couldn.t load TSIG keys/i)).toBeInTheDocument();
    expect(screen.queryByText(/No TSIG keys configured/i)).not.toBeInTheDocument();
    // ...and the surfaced error reassures the user their keys are intact.
    expect(screen.getByText(/briefly rate limited/i)).toBeInTheDocument();
  });
});
