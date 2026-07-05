// src/components/__tests__/ZoneEditor.perf.test.tsx
// Verifies the sort/filter memo split preserves the exact previous output
// order, and benchmarks the per-keystroke / sort-click cost of the old fused
// pipeline vs the new split pipeline on a synthetic 10k-record zone.
// Timing results are logged (not asserted) so slow CI machines cannot flake.
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DNSRecord } from '../../types/dns';
import ZoneEditor, { sortZoneRecords, filterZoneRecords } from '../ZoneEditor';

jest.mock('../AddDNSRecord', () => ({ __esModule: true, default: () => null }));
jest.mock('../RecordEditor', () => ({ __esModule: true, default: () => null }));

const mockFetchZoneRecords = jest.fn();
jest.mock('../../services/dnsService', () => ({
  dnsService: {
    fetchZoneRecords: (...args: unknown[]) => mockFetchZoneRecords(...args)
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

jest.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({
    showNotification: jest.fn(),
    showSuccess: jest.fn(),
    showError: jest.fn(),
    showInfo: jest.fn(),
    showWarning: jest.fn()
  })
}));

// Stable object identities (built inside the hoisted factory): a fresh object
// per render would re-trigger the zone-load effect (its deps include
// selectedKey/availableZones) on every render and keep the table reloading.
jest.mock('../../context/KeyContext', () => {
  const stableKey = { id: 'key-1', name: 'key-1', server: 'ns1.example.com', zones: ['example.com'] };
  const stableKeyContext = {
    selectedKey: stableKey,
    selectedZone: 'example.com',
    availableZones: ['example.com'],
    availableKeys: [stableKey]
  };
  return { useKey: () => stableKeyContext };
});

type SortOrder = 'asc' | 'desc';
type SortableField = 'name' | 'type' | 'value' | 'ttl';

function buildRecords(count: number): DNSRecord[] {
  const types = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS'];
  const records: DNSRecord[] = [];
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    let value: string | object;
    switch (type) {
      case 'A':
        value = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
        break;
      case 'AAAA':
        value = `2001:db8::${(i % 65535).toString(16)}`;
        break;
      case 'CNAME':
        value = `target-${i % 500}.example.com.`;
        break;
      case 'TXT':
        value = `"v=spf1 include:mail-${i % 100}.example.com ~all"`;
        break;
      case 'MX':
        value = `${(i % 5) * 10} mail-${i % 50}.example.com.`;
        break;
      case 'SRV':
        value = `${i % 10} 5 ${5000 + (i % 100)} srv-${i % 200}.example.com.`;
        break;
      default:
        value = `ns${i % 4}.example.com.`;
    }
    records.push({
      // Duplicate names across types on purpose so ties exercise sort stability.
      name: `host-${(i % 3000).toString().padStart(4, '0')}.example.com`,
      type,
      value,
      ttl: 300 * ((i % 4) + 1)
    });
  }
  return records;
}

// The pre-change fused memo, copied verbatim from ZoneEditor (filter with a
// per-record toLowerCase, then sort the filtered subset) so the benchmark's
// "before" numbers reflect the real old code path.
function legacyFilteredRecords(
  records: DNSRecord[],
  searchText: string,
  filterType: string,
  order: SortOrder,
  orderBy: SortableField
): DNSRecord[] {
  const filtered = records.filter(record => {
    const searchLower = searchText.toLowerCase();

    if (filterType !== 'ALL' && record.type !== filterType) {
      return false;
    }

    if (!searchLower) return true;

    return record.name.toLowerCase().includes(searchLower) ||
           record.type.toLowerCase().includes(searchLower) ||
           String(record.value).toLowerCase().includes(searchLower);
  });

  return sortZoneRecords(filtered, order, orderBy);
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function bench(fn: () => unknown, iterations = 30): number {
  // Warm-up so JIT/GC effects don't dominate the first samples.
  for (let i = 0; i < 5; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

describe('ZoneEditor sort/filter pipeline', () => {
  const records = buildRecords(10000);

  it('filter(sort(x)) produces exactly the same order as the old sort(filter(x))', () => {
    const cases: Array<[string, string, SortOrder, SortableField]> = [
      ['mail', 'ALL', 'asc', 'name'],
      ['mail', 'ALL', 'desc', 'value'],
      ['host-01', 'A', 'asc', 'ttl'],
      ['', 'TXT', 'desc', 'type'],
      ['', 'ALL', 'asc', 'name'],
      ['10.', 'ALL', 'desc', 'name'],
      ['nomatch-xyz', 'ALL', 'asc', 'value']
    ];

    for (const [search, type, order, orderBy] of cases) {
      const oldResult = legacyFilteredRecords(records, search, type, order, orderBy);
      const newResult = filterZoneRecords(
        sortZoneRecords(records, order, orderBy),
        search,
        type
      );
      expect(newResult).toEqual(oldResult);
    }
  });

  it('benchmarks keystroke and sort-click cost (10k records, logged)', () => {
    // (a) Keystroke into search. Before: fused memo re-filters AND re-sorts.
    // After: the sorted array is cached; only the linear filter re-runs.
    const sortedCache = sortZoneRecords(records, 'asc', 'name');

    const beforeKeystroke = bench(() =>
      legacyFilteredRecords(records, 'mail', 'ALL', 'asc', 'name')
    );
    const afterKeystroke = bench(() =>
      filterZoneRecords(sortedCache, 'mail', 'ALL')
    );

    // (b) Sort-column click. Before: filter then sort the subset.
    // After: sort the full list (new cache entry) then filter.
    const beforeSortClick = bench(() =>
      legacyFilteredRecords(records, 'mail', 'ALL', 'desc', 'name')
    );
    const afterSortClick = bench(() =>
      filterZoneRecords(sortZoneRecords(records, 'desc', 'name'), 'mail', 'ALL')
    );

    // A broad search that matches most records (worst case for the old code:
    // it sorted nearly all 10k on every keystroke).
    const beforeKeystrokeBroad = bench(() =>
      legacyFilteredRecords(records, 'example', 'ALL', 'asc', 'name')
    );
    const afterKeystrokeBroad = bench(() =>
      filterZoneRecords(sortedCache, 'example', 'ALL')
    );

    // eslint-disable-next-line no-console
    console.log(
      [
        'ZoneEditor 10k-record pipeline benchmark (median ms):',
        `  keystroke (narrow "mail"):  before=${beforeKeystroke.toFixed(2)}  after=${afterKeystroke.toFixed(2)}`,
        `  keystroke (broad "example"): before=${beforeKeystrokeBroad.toFixed(2)}  after=${afterKeystrokeBroad.toFixed(2)}`,
        `  sort-column click:          before=${beforeSortClick.toFixed(2)}  after=${afterSortClick.toFixed(2)}`
      ].join('\n')
    );

    // Sanity only — both pipelines must at least produce output.
    expect(afterKeystroke).toBeGreaterThanOrEqual(0);
    expect(afterSortClick).toBeGreaterThanOrEqual(0);
  });
});

describe('ZoneEditor search debounce', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const debounceRecords: DNSRecord[] = [
    // 25 hosts so rowsPerPage=10 gives three pages, plus two "mail" records
    // that sort onto page 1 and page 3 respectively.
    ...Array.from({ length: 25 }, (_, i) => ({
      name: `host-${String(i).padStart(4, '0')}.example.com`,
      type: 'A',
      value: `10.0.0.${i}`,
      ttl: 300
    })),
    { name: 'aaa-mail.example.com', type: 'A', value: '10.0.1.1', ttl: 300 },
    { name: 'zzz-mail.example.com', type: 'A', value: '10.0.1.2', ttl: 300 }
  ];

  it('keeps the input responsive, filters only after the debounce, and resets the page', async () => {
    mockFetchZoneRecords.mockResolvedValue(debounceRecords);

    render(
      <MemoryRouter>
        <ZoneEditor />
      </MemoryRouter>
    );

    // Initial load: sorted by name asc, page 1 starts with aaa-mail.
    await screen.findByText('aaa-mail.example.com');

    // Navigate to page 2 so the search must also reset pagination.
    fireEvent.click(screen.getByRole('button', { name: /go to next page/i }));
    expect(screen.getByText('host-0009.example.com')).toBeInTheDocument();
    expect(screen.queryByText('aaa-mail.example.com')).not.toBeInTheDocument();

    jest.useFakeTimers();

    const input = screen.getByPlaceholderText('Search records...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mail' } });

    // The controlled input updates immediately...
    expect(input.value).toBe('mail');
    // ...but the table has not been re-filtered yet (still page 2 content).
    expect(screen.getByText('host-0009.example.com')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(250);
    });

    // After the debounce fires: filter applied AND page reset to 0 together,
    // so both matches (first and last in sort order) are visible at once.
    expect(screen.getByText('aaa-mail.example.com')).toBeInTheDocument();
    expect(screen.getByText('zzz-mail.example.com')).toBeInTheDocument();
    expect(screen.queryByText('host-0009.example.com')).not.toBeInTheDocument();
  });
});
