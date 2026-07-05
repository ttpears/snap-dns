// src/components/__tests__/Settings.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import Settings from '../Settings';
import type { Config } from '../../types/config';

// TSIG keys live server-side; Settings talks to them only through this API
// client, mocked per test.
const mockListKeys = jest.fn();
const mockCreateKey = jest.fn();
const mockUpdateKey = jest.fn();
jest.mock('../../services/tsigKeyService', () => ({
  tsigKeyService: {
    listKeys: (...args: unknown[]) => mockListKeys(...args),
    createKey: (...args: unknown[]) => mockCreateKey(...args),
    updateKey: (...args: unknown[]) => mockUpdateKey(...args)
  }
}));

const mockUpdateConfig = jest.fn();
let mockConfig: Config;
jest.mock('../../context/ConfigContext', () => ({
  useConfig: () => ({
    config: mockConfig,
    updateConfig: (...args: unknown[]) => mockUpdateConfig(...args)
  })
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'tester', role: 'editor' } })
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockShowInfo = jest.fn();
jest.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: mockShowInfo
  })
}));

jest.mock('../../services/notificationService', () => ({
  notificationService: {
    setWebhookConfig: jest.fn(),
    testWebhook: jest.fn()
  }
}));

// Heavy sibling tabs are irrelevant to the import/export flows under test.
jest.mock('../TSIGKeyManagement', () => function MockTSIGKeyManagement() { return null; });
jest.mock('../UserManagement', () => function MockUserManagement() { return null; });
jest.mock('../SSOConfiguration', () => function MockSSOConfiguration() { return null; });
jest.mock('../AuditLog', () => function MockAuditLog() { return null; });

const serverKeyA = {
  id: 'key-a',
  name: 'Key A',
  server: 'ns1.example.com',
  keyName: 'key-a.example.com.',
  algorithm: 'hmac-sha256',
  zones: ['example.com'],
  createdAt: new Date(),
  updatedAt: new Date()
};

const serverKeyB = {
  id: 'key-b',
  name: 'Key B',
  server: 'ns2.example.com',
  keyName: 'key-b.example.com.',
  algorithm: 'hmac-sha256',
  zones: ['other.org'],
  createdAt: new Date(),
  updatedAt: new Date()
};

async function renderSettings() {
  await act(async () => {
    render(<Settings />);
  });
}

// Feed a JSON payload through the hidden file input and wait for the
// import dialog to open (the FileReader load event is asynchronous).
async function openImportDialog(data: unknown) {
  const input = screen.getByLabelText(/Import Configuration/i);
  const file = new File([JSON.stringify(data)], 'backup.json', {
    type: 'application/json'
  });
  fireEvent.change(input, { target: { files: [file] } });
  return await screen.findByRole('dialog');
}

async function confirmImport(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));
  await waitFor(() => {
    expect(mockShowSuccess.mock.calls.length + mockShowError.mock.calls.length)
      .toBeGreaterThan(0);
  });
}

// Recursively collect the paths of any keyValue/secret fields so export
// assertions can prove no secret material appears anywhere in the blob.
function findSecretFields(value: unknown, path = '$', found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, i) => findSecretFields(item, `${path}[${i}]`, found));
  } else if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      if (key === 'keyValue' || key === 'secret') {
        found.push(`${path}.${key}`);
      }
      findSecretFields(child, `${path}.${key}`, found);
    });
  }
  return found;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockConfig = {
    defaultTTL: 3600,
    rowsPerPage: 10,
    webhookUrl: null,
    webhookProvider: null
  };
  mockListKeys.mockResolvedValue([serverKeyA, serverKeyB]);
  mockUpdateKey.mockResolvedValue(serverKeyA);
  mockCreateKey.mockResolvedValue(serverKeyA);
  mockUpdateConfig.mockResolvedValue(undefined);
});

describe('Settings full-backup import', () => {
  it('merges zones into a server key matched by id and reports it as updated', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [{ id: 'key-a', name: 'Key A', zones: ['new.example.net'] }]
      }
    });
    await confirmImport(dialog);

    expect(mockUpdateKey).toHaveBeenCalledTimes(1);
    expect(mockUpdateKey).toHaveBeenCalledWith('key-a', {
      zones: ['example.com', 'new.example.net']
    });
    expect(mockCreateKey).not.toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Configuration imported successfully (1 key updated)'
    );
  });

  it('does not count a matched key as updated when its zones are unchanged', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [{ id: 'key-a', name: 'Key A', zones: ['example.com'] }]
      }
    });
    await confirmImport(dialog);

    expect(mockUpdateKey).not.toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith('Configuration imported successfully');
  });

  it('falls back to matching by name when the id does not match', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [{ id: 'stale-id', name: 'Key B', zones: ['added.example.net'] }]
      }
    });
    await confirmImport(dialog);

    expect(mockUpdateKey).toHaveBeenCalledWith('key-b', {
      zones: ['other.org', 'added.example.net']
    });
  });

  it('creates an unmatched key through the API when the file carries a legacy secret', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [{
          name: 'Legacy Key',
          keyName: 'legacy.example.com.',
          server: 'ns9.example.com',
          algorithm: 'hmac-md5',
          keyValue: 'LEGACY-TSIG-SECRET==',
          zones: ['legacy.org']
        }]
      }
    });
    await confirmImport(dialog);

    expect(mockCreateKey).toHaveBeenCalledWith({
      name: 'Legacy Key',
      server: 'ns9.example.com',
      keyName: 'legacy.example.com.',
      keyValue: 'LEGACY-TSIG-SECRET==',
      algorithm: 'hmac-md5',
      zones: ['legacy.org']
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Configuration imported successfully (1 key created)'
    );

    // The secret goes to the backend API only, never into localStorage or
    // the frontend config.
    Object.keys(localStorage).forEach((storageKey) => {
      expect(localStorage.getItem(storageKey)).not.toContain('LEGACY-TSIG-SECRET');
    });
    mockUpdateConfig.mock.calls.forEach(([configArg]) => {
      expect(JSON.stringify(configArg)).not.toContain('LEGACY-TSIG-SECRET');
      expect(configArg).not.toHaveProperty('keys');
    });
  });

  it('accepts the legacy "secret" field name when creating an unmatched key', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [{ name: 'Old Style', secret: 'OLD-STYLE-SECRET==', zones: [] }]
      }
    });
    await confirmImport(dialog);

    expect(mockCreateKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyValue: 'OLD-STYLE-SECRET==' })
    );
  });

  it('skips an unmatched key without a secret and reports the skip reason', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [{ name: 'Orphan Key', zones: ['orphan.example.net'] }]
      }
    });
    await confirmImport(dialog);

    expect(mockCreateKey).not.toHaveBeenCalled();
    expect(mockUpdateKey).not.toHaveBeenCalled();
    expect(mockShowInfo).toHaveBeenCalledWith(
      'Skipped 1 key entry: Orphan Key (no secret in file and no matching server key)'
    );
    // The import as a whole still succeeds.
    expect(mockShowSuccess).toHaveBeenCalledWith('Configuration imported successfully');
  });

  it('reports a per-key API failure as skipped without aborting the other keys', async () => {
    mockUpdateKey.mockRejectedValueOnce(new Error('zone quota exceeded'));
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 3600,
        keys: [
          { id: 'key-a', name: 'Key A', zones: ['fails.example.net'] },
          { name: 'New Key', keyValue: 'NEW-SECRET==', zones: [] }
        ]
      }
    });
    await confirmImport(dialog);

    // The failing update lands in the skip report...
    expect(mockShowInfo).toHaveBeenCalledWith(
      'Skipped 1 key entry: Key A (zone quota exceeded)'
    );
    // ...while the remaining entry is still processed and counted.
    expect(mockCreateKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Key' })
    );
    expect(mockShowSuccess).toHaveBeenCalledWith(
      'Configuration imported successfully (1 key created)'
    );
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('applies imported settings fields via updateConfig', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: {
        defaultTTL: 300,
        rowsPerPage: 50,
        webhookUrl: 'https://hooks.example.com/import',
        webhookProvider: 'slack'
      }
    });
    await confirmImport(dialog);

    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
      defaultTTL: 300,
      rowsPerPage: 50,
      webhookUrl: 'https://hooks.example.com/import',
      webhookProvider: 'slack'
    }));
    expect(mockUpdateConfig.mock.calls[0][0]).not.toHaveProperty('keys');
  });

  it('ignores legacy dnsBackups entries with an info toast and writes nothing to localStorage', async () => {
    await renderSettings();
    const dialog = await openImportDialog({
      dns_manager_config: { defaultTTL: 3600 },
      dnsBackups: [
        { id: 'b1', timestamp: 1, zone: 'example.com', server: 'ns1', records: [], type: 'manual', version: '1' },
        { id: 'b2', timestamp: 2, zone: 'other.org', server: 'ns2', records: [], type: 'auto', version: '1' }
      ]
    });
    await confirmImport(dialog);

    expect(mockShowInfo).toHaveBeenCalledWith(
      expect.stringContaining('2 legacy snapshot entries were ignored')
    );
    expect(localStorage.getItem('dnsBackups')).toBeNull();
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
});

describe('Settings zones-only import', () => {
  const zonesFile = {
    dns_manager_config: { zones: ['imported.example.net', 'other.org'] }
  };

  it('lists server-side keys in the target-key dropdown', async () => {
    await renderSettings();
    const dialog = await openImportDialog(zonesFile);

    fireEvent.mouseDown(within(dialog).getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Key A')).toBeInTheDocument();
    expect(within(listbox).getByText('Key B')).toBeInTheDocument();
  });

  it('merges imported zones into the selected server key via updateKey', async () => {
    await renderSettings();
    const dialog = await openImportDialog(zonesFile);

    fireEvent.mouseDown(within(dialog).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Key B' }));
    await confirmImport(dialog);

    // Union of the key's existing zones and the imported list, deduplicated
    // (other.org appears in both).
    expect(mockUpdateKey).toHaveBeenCalledTimes(1);
    expect(mockUpdateKey).toHaveBeenCalledWith('key-b', {
      zones: ['other.org', 'imported.example.net']
    });
    expect(mockShowSuccess).toHaveBeenCalledWith('Zones imported successfully');
  });

  it('requires a target key before importing zones', async () => {
    await renderSettings();
    const dialog = await openImportDialog(zonesFile);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await within(dialog).findByText(
      'Please select a key to associate with the imported zones'
    )).toBeInTheDocument();
    expect(mockUpdateKey).not.toHaveBeenCalled();
  });
});

describe('Settings export', () => {
  const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
  const mockRevokeObjectURL = jest.fn();
  let anchorClick: jest.SpyInstance;

  beforeAll(() => {
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;
    anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  afterAll(() => {
    anchorClick.mockRestore();
  });

  function readBlobAsText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  async function exportAndParse(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
    const blob = mockCreateObjectURL.mock.calls[0][0] as unknown as Blob;
    return JSON.parse(await readBlobAsText(blob));
  }

  async function openExportDialog() {
    fireEvent.click(screen.getByRole('button', { name: /Export Configuration/i }));
    return await screen.findByRole('dialog');
  }

  it('exports key metadata from the server key list with no secrets anywhere in the blob', async () => {
    mockConfig = {
      defaultTTL: 86400,
      rowsPerPage: 25,
      webhookUrl: 'https://hooks.example.com/x',
      webhookProvider: 'slack'
    };
    await renderSettings();
    const dialog = await openExportDialog();

    fireEvent.click(within(dialog).getByLabelText(/Include TSIG key metadata/i));
    const exported = await exportAndParse(dialog);

    // Built from tsigKeyService.listKeys() metadata.
    expect(exported.dns_manager_config.keys).toEqual([
      {
        id: 'key-a',
        name: 'Key A',
        server: 'ns1.example.com',
        keyName: 'key-a.example.com.',
        algorithm: 'hmac-sha256',
        zones: ['example.com']
      },
      {
        id: 'key-b',
        name: 'Key B',
        server: 'ns2.example.com',
        keyName: 'key-b.example.com.',
        algorithm: 'hmac-sha256',
        zones: ['other.org']
      }
    ]);

    // The metadata note explains how re-import matches these entries.
    expect(exported.keyExportNote).toMatch(/metadata only/);

    // Deep scan: no keyValue/secret field at any depth.
    expect(findSecretFields(exported)).toEqual([]);

    // Settings ride along by default.
    expect(exported.dns_manager_config).toMatchObject({
      defaultTTL: 86400,
      rowsPerPage: 25,
      webhookUrl: 'https://hooks.example.com/x',
      webhookProvider: 'slack'
    });
  });

  it('omits keys entirely when the key-metadata checkbox is left unchecked', async () => {
    await renderSettings();
    const dialog = await openExportDialog();

    const exported = await exportAndParse(dialog);

    expect(exported.dns_manager_config).not.toHaveProperty('keys');
    expect(exported).not.toHaveProperty('keyExportNote');
    expect(exported.dns_manager_config).toHaveProperty('defaultTTL', 3600);
  });

  it('exports only the deduplicated zone list in zones-only mode', async () => {
    await renderSettings();
    const dialog = await openExportDialog();

    fireEvent.click(within(dialog).getByLabelText(/Export zones only/i));
    const exported = await exportAndParse(dialog);

    expect(exported).toEqual({
      dns_manager_config: {
        zones: expect.arrayContaining(['example.com', 'other.org'])
      }
    });
    expect(exported.dns_manager_config.zones).toHaveLength(2);
    expect(findSecretFields(exported)).toEqual([]);
  });
});
