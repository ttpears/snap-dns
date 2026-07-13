// src/components/__tests__/TokenManagement.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TokenManagement from '../TokenManagement';

// The component talks to the backend only through this API client, mocked
// per test.
const mockListTokens = jest.fn();
const mockCreateToken = jest.fn();
const mockRevokeToken = jest.fn();
jest.mock('../../services/tokenService', () => ({
  tokenService: {
    listTokens: (...args: unknown[]) => mockListTokens(...args),
    createToken: (...args: unknown[]) => mockCreateToken(...args),
    revokeToken: (...args: unknown[]) => mockRevokeToken(...args),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 't', role: 'editor' } }),
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: jest.fn(),
  }),
}));

const sampleToken = {
  id: 'token_1',
  name: 'ci-runner',
  prefix: 'sdns_1a2b3c',
  createdAt: '2026-07-13T12:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListTokens.mockResolvedValue([sampleToken]);
  mockCreateToken.mockResolvedValue({
    token: 'sdns_' + 'a'.repeat(40),
    id: 'token_2',
    name: 'new-token',
    prefix: 'sdns_aaaaaa',
    createdAt: '2026-07-13T12:00:00.000Z',
    expiresAt: null,
  });
  mockRevokeToken.mockResolvedValue(undefined);
});

describe('TokenManagement', () => {
  it('renders a row per token with metadata and "Never" for null fields', async () => {
    render(<TokenManagement />);

    expect(await screen.findByText('ci-runner')).toBeInTheDocument();
    expect(screen.getByText('sdns_1a2b3c')).toBeInTheDocument();
    // Both lastUsedAt and expiresAt are null -> two "Never" cells.
    expect(screen.getAllByText('Never')).toHaveLength(2);
  });

  it('creates a token and reveals the raw value exactly once', async () => {
    render(<TokenManagement />);
    await screen.findByText('ci-runner');

    fireEvent.click(screen.getByRole('button', { name: /create token/i }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/token name/i), {
      target: { value: 'new-token' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    // Called with no expiry (undefined) since "Never" is the default.
    await waitFor(() => {
      expect(mockCreateToken).toHaveBeenCalledWith('new-token', undefined);
    });

    const rawToken = 'sdns_' + 'a'.repeat(40);
    expect(await screen.findByDisplayValue(rawToken)).toBeInTheDocument();
    expect(
      screen.getByText(/you will not be able to see it again/i)
    ).toBeInTheDocument();
    // A copy control exists in the reveal view.
    expect(screen.getByTitle('Copy token')).toBeInTheDocument();

    // Clicking "Done" clears the raw token from view.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue(rawToken)).not.toBeInTheDocument();
    });
  });

  it('revokes a token after confirmation and reloads', async () => {
    render(<TokenManagement />);
    await screen.findByText('ci-runner');

    fireEvent.click(screen.getByTitle('Revoke token'));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(mockRevokeToken).toHaveBeenCalledWith('token_1');
    });
    expect(mockShowSuccess).toHaveBeenCalledWith('Token revoked');
    // Initial load + reload after revoke.
    expect(mockListTokens).toHaveBeenCalledTimes(2);
  });
});
