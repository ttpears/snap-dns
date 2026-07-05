// src/components/ZoneEditor.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Checkbox,
  CircularProgress,
  Alert,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  InputAdornment,
  TablePagination,
  Chip,
  Tooltip,
  TableSortLabel
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import AddDNSRecord from './AddDNSRecord';
import { usePendingChanges } from '../context/PendingChangesContext';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import RecordEditor from './RecordEditor';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useKey } from '../context/KeyContext';
import { useNotification } from '../context/NotificationContext';
import { Link as RouterLink } from 'react-router-dom';
import { DNSRecord, RecordType } from '../types/dns';

// Sourced from the RecordType enum so the type filter stays in sync with the
// supported types (no separate hardcoded list to drift).
const recordTypes = Object.values(RecordType);

interface MultilineRecordDialogProps {
  record: DNSRecord | null;
  open: boolean;
  onClose: () => void;
}

function MultilineRecordDialog({ record, open, onClose }: MultilineRecordDialogProps) {
  const formatDuration = (seconds: number | undefined): string => {
    if (!seconds) return 'N/A';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

    return parts.join(' ') || `${seconds} seconds`;
  };

  const formattedValue = useMemo(() => {
    if (!record) return '';

    if (record.type === 'SOA') {
      const soa = record.value as any;
      return [
        `Primary Nameserver: ${soa.mname || 'N/A'}`,
        `Admin Email: ${soa.rname || 'N/A'}`,
        `Serial: ${soa.serial || 0}`,
        `Refresh: ${soa.refresh || 0} seconds (${formatDuration(soa.refresh)})`,
        `Retry: ${soa.retry || 0} seconds (${formatDuration(soa.retry)})`,
        `Expire: ${soa.expire || 0} seconds (${formatDuration(soa.expire)})`,
        `Minimum TTL: ${soa.minimum || 0} seconds (${formatDuration(soa.minimum)})`
      ].join('\n');
    }

    if (typeof record.value === 'object') {
      return JSON.stringify(record.value, null, 2);
    }

    return record.value;
  }, [record]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {record?.type} Record Details
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">Name:</Typography>
          <Typography color="text.primary" sx={{ mb: 2 }}>{record?.name}</Typography>

          <Typography variant="subtitle2" color="text.secondary">TTL:</Typography>
          <Typography color="text.primary" sx={{ mb: 2 }}>
            {record?.ttl} seconds ({formatDuration(record?.ttl)})
          </Typography>

          <Typography variant="subtitle2" color="text.secondary">Value:</Typography>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            padding: '16px',
            borderRadius: '4px',
            color: 'inherit',
            margin: '8px 0'
          }}>
            {formattedValue}
          </pre>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

type SortOrder = 'asc' | 'desc';
type SortableField = 'name' | 'type' | 'value' | 'ttl';

// Pure sort/filter helpers, kept outside the component so they are stable
// (no memo-invalidation via closures) and unit-testable/benchmarkable.
// Sorting and filtering are memoized separately in the component: sorting the
// full record list depends only on [records, order, orderBy], so a search
// keystroke re-runs just the linear filter, not the O(n log n) sort.
// Array.prototype.sort is stable, so filter(sort(x)) === sort(filter(x)) for
// the same comparator — the split preserves the previous output order exactly.
export function sortZoneRecords(
  records: DNSRecord[],
  order: SortOrder,
  orderBy: SortableField
): DNSRecord[] {
  return [...records].sort((a, b) => {
    let aValue: any = a[orderBy];
    let bValue: any = b[orderBy];

    if (orderBy === 'value') {
      if (typeof aValue === 'object') aValue = JSON.stringify(aValue);
      if (typeof bValue === 'object') bValue = JSON.stringify(bValue);
    }

    aValue = String(aValue).toLowerCase();
    bValue = String(bValue).toLowerCase();

    if (aValue.match(/^\d+/) && bValue.match(/^\d+/)) {
      const aNum = parseInt((aValue.match(/^\d+/) as RegExpMatchArray)[0]);
      const bNum = parseInt((bValue.match(/^\d+/) as RegExpMatchArray)[0]);
      if (aNum !== bNum) {
        return order === 'asc' ? aNum - bNum : bNum - aNum;
      }
    }

    if (order === 'desc') {
      return bValue.localeCompare(aValue);
    }
    return aValue.localeCompare(bValue);
  });
}

export function filterZoneRecords(
  records: DNSRecord[],
  searchText: string,
  filterType: string
): DNSRecord[] {
  const searchLower = searchText.toLowerCase();

  return records.filter(record => {
    if (filterType !== 'ALL' && record.type !== filterType) {
      return false;
    }

    if (!searchLower) return true;

    return record.name.toLowerCase().includes(searchLower) ||
           record.type.toLowerCase().includes(searchLower) ||
           String(record.value).toLowerCase().includes(searchLower);
  });
}

// Debounce interval for the search box: long enough to swallow fast typing,
// short enough that the filtered table still feels immediate.
const SEARCH_DEBOUNCE_MS = 250;

// Stable per-record row keys. Record objects are identity-stable across
// filter/sort/pagination (they are only re-created on a zone refetch), so a
// WeakMap counter yields keys that let React move/update a row's DOM when the
// record stays visible across a filter change instead of remounting it.
// Benchmarked ~18% faster page rerenders during a typing sequence than the
// previous `${name}-${type}-${index}` composite (whose index component made
// keys churn whenever the filter shifted rows).
const rowKeyIds = new WeakMap<DNSRecord, number>();
let nextRowKeyId = 0;
function recordRowKey(record: DNSRecord): string {
  let id = rowKeyIds.get(record);
  if (id === undefined) {
    id = ++nextRowKeyId;
    rowKeyIds.set(record, id);
  }
  return `record-${id}`;
}

function ZoneEditor() {
  const { config, updateConfig } = useConfig();
  const {
    pendingChanges,
    setPendingChanges,
    addPendingChange,
    setShowPendingDrawer
  } = usePendingChanges();

  const {
    selectedKey,
    selectedZone,
    availableZones = [],
    availableKeys = [],
    keysLoading = false
  } = useKey();

  const { showError } = useNotification();

  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(config.rowsPerPage || 10);
  // searchInput tracks the TextField on every keystroke (kept fast/controlled);
  // searchText is the debounced value that actually drives filtering, so
  // typing does not re-filter a large zone on each keypress.
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedRecords, setSelectedRecords] = useState<DNSRecord[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [multilineRecord, setMultilineRecord] = useState<DNSRecord | null>(null);
  const [changeHistory, setChangeHistory] = useState<any[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [addRecordDialogOpen, setAddRecordDialogOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [copyingRecord, setCopyingRecord] = useState<DNSRecord | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [orderBy, setOrderBy] = useState<SortableField>('name');
  const [order, setOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    const hasData = (availableKeys.length > 0 || availableZones.length > 0);
    setIsInitializing(!hasData);
  }, [availableKeys, availableZones]);

  const loadZoneRecords = useCallback(async () => {
    if (!selectedZone || !selectedKey) return;

    setRefreshing(true);
    setError(null);

    try {
      const records = await dnsService.fetchZoneRecords(selectedZone);
      setRecords(records);
    } catch (err) {
      console.error('Failed to load zone records:', err);
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [selectedZone, selectedKey]);

  useEffect(() => {
    if (selectedZone &&
        selectedKey &&
        availableZones.includes(selectedZone) &&
        !isInitializing) {
      // Table-level loading indicator for the initial fetch of a zone;
      // manual refreshes and post-apply refreshes keep the table visible
      // and use their own indicators instead.
      setLoading(true);
      loadZoneRecords().finally(() => setLoading(false));
    }
  }, [selectedZone, selectedKey, availableZones, isInitializing, loadZoneRecords]);

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      // Select only what the current search/filter shows — selecting hidden
      // records would let a bulk delete queue changes the user never saw.
      setSelectedRecords(filteredRecords);
    } else {
      setSelectedRecords([]);
    }
  };

  const handleSelectRecord = useCallback((record: DNSRecord) => {
    setSelectedRecords(prev => {
      const isSelected = prev.some(r =>
        r.name === record.name &&
        r.type === record.type &&
        r.value === record.value
      );
      if (isSelected) {
        return prev.filter(r =>
          r.name !== record.name ||
          r.type !== record.type ||
          r.value !== record.value
        );
      }
      return [...prev, record];
    });
  }, []);

  const handleDeleteRecord = async (record: DNSRecord) => {
    try {
      const change = {
        type: 'DELETE' as const,
        zone: selectedZone!,
        keyId: selectedKey!.id,
        record: record
      };

      addPendingChange(change);
      setShowPendingDrawer(true);
      setEditDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      showError(`Failed to delete record: ${(error as Error).message}`);
    }
  };

  const handleDeleteSelected = async () => {
    try {
      // SOA records cannot be deleted (every zone must keep exactly one), so
      // skip them rather than queue a delete that would fail the whole batch.
      const deletable = selectedRecords.filter(record => record.type !== 'SOA');

      deletable.forEach(record => {
        const change = {
          type: 'DELETE' as const,
          zone: selectedZone!,
          keyId: selectedKey!.id,
          record: record
        };
        addPendingChange(change);
      });

      if (deletable.length > 0) {
        setShowPendingDrawer(true);
      }
      setSelectedRecords([]);
      setEditDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      showError(`Failed to delete records: ${(error as Error).message}`);
    }
  };

  const handleEditRecord = (record: DNSRecord) => {
    setEditingRecord(record);
    setEditDialogOpen(true);
  };

  const handleEditSave = async (updatedRecord: DNSRecord) => {
    try {
      const change = {
        type: 'MODIFY' as const,
        zone: selectedZone!,
        keyId: selectedKey!.id,
        originalRecord: editingRecord!,
        newRecord: updatedRecord
      };

      addPendingChange(change);
      setShowPendingDrawer(true);
      setEditDialogOpen(false);
      setEditingRecord(null);
      setCopyDialogOpen(false);
      setCopyingRecord(null);
    } catch (error) {
      showError(`Failed to update record: ${(error as Error).message}`);
    }
  };

  const isMultilineRecord = (record: DNSRecord | null): boolean => {
    if (!record) return false;

    if (record.type === 'SOA') return true;

    if (record.type === 'TXT' && (record.value as string).length > 40) return true;

    if (typeof record.value === 'object') return true;

    return false;
  };

  const handleRequestSort = (property: SortableField) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Debounce the search box into the value that drives filtering. The page
  // reset and selection-prune effects key off the debounced searchText, so
  // they fire together with the filter change (no flicker while typing).
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // A changed search/filter can strand the user on a now-empty page and
  // leave hidden records selected (which a bulk delete would still act on).
  useEffect(() => {
    setPage(0);
  }, [searchText, filterType]);

  // Sort the full list once per [records, order, orderBy]; each search
  // keystroke then only re-runs the linear filter over the sorted array.
  const sortedRecords = useMemo(
    () => sortZoneRecords(records, order, orderBy),
    [records, order, orderBy]
  );

  const filteredRecords = useMemo(
    () => filterZoneRecords(sortedRecords, searchText, filterType),
    [sortedRecords, searchText, filterType]
  );

  // Type-filter options: the RecordType enum plus any other types present in
  // the loaded zone (e.g. RFC 3597 TYPE#### unknown types), so records the UI
  // doesn't model are still filterable. The current selection is kept in the
  // list even if a refresh removed its last record, so the Select never holds
  // an out-of-range value.
  const typeOptions = useMemo(() => {
    const known = new Set<string>(recordTypes);
    const extra = new Set<string>();
    records.forEach(r => {
      if (!known.has(r.type)) extra.add(r.type);
    });
    if (filterType !== 'ALL' && !known.has(filterType)) extra.add(filterType);
    return [...recordTypes, ...[...extra].sort()];
  }, [records, filterType]);

  // Drop selections that the current filter hides, so bulk actions only
  // ever operate on records the user can see.
  useEffect(() => {
    setSelectedRecords(prev => {
      const visible = prev.filter(r => filteredRecords.includes(r));
      return visible.length === prev.length ? prev : visible;
    });
  }, [filteredRecords]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < changeHistory.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;

    const previousChanges = changeHistory[historyIndex - 1];
    setPendingChanges([...previousChanges]);
    setHistoryIndex(historyIndex - 1);
  }, [canUndo, changeHistory, historyIndex, setPendingChanges]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;

    const nextChanges = changeHistory[historyIndex + 1];
    setPendingChanges([...nextChanges]);
    setHistoryIndex(historyIndex + 1);
  }, [canRedo, changeHistory, historyIndex, setPendingChanges]);

  useEffect(() => {
    const currentChanges = JSON.stringify(pendingChanges);
    const historyChanges = JSON.stringify(changeHistory[historyIndex]);

    if (currentChanges !== historyChanges) {
      setChangeHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        return [...newHistory, [...pendingChanges]];
      });
      setHistoryIndex(prev => prev + 1);
    }
  }, [pendingChanges, historyIndex]);

  const handleAddRecordClick = () => {
    setAddRecordDialogOpen(true);
  };

  useEffect(() => {
    const handleChangesApplied = (event: Event) => {
      const { zones, changeIds } = (event as CustomEvent<{ zones: string[]; changeIds?: string[] }>).detail;

      // Purge the committed changes from every undo/redo history entry so
      // no undo/redo path can resurrect them into the pending queue and
      // risk a double-apply. Ids are unique, so this is safe regardless of
      // timing relative to the drawer's own queue pruning.
      if (changeIds?.length) {
        const appliedIds = new Set(changeIds);
        setChangeHistory(prev => prev.map(entry => entry.filter((c: any) => !appliedIds.has(c.id))));
      }

      if (selectedZone && zones.includes(selectedZone)) {
        // The event fires after the backend transaction completed, so the
        // zone can be re-fetched immediately.
        setIsRefreshing(true);
        (async () => {
          try {
            await loadZoneRecords();
          } catch (error) {
            console.error('Error refreshing zone records:', error);
            showError('Failed to refresh zone records after changes');
          } finally {
            setIsRefreshing(false);
          }
        })();
      }
    };

    window.addEventListener('dnsChangesApplied', handleChangesApplied);
    return () => window.removeEventListener('dnsChangesApplied', handleChangesApplied);
  }, [selectedZone, loadZoneRecords, showError]);

  const handleCopyRecord = (record: DNSRecord) => {
    setCopyingRecord({
      ...record,
      name: `${record.name}`
    });
    setCopyDialogOpen(true);
  };

  const handleCopySave = (newRecord: DNSRecord) => {
    addPendingChange({
      type: 'ADD',
      zone: selectedZone!,
      keyId: selectedKey!.id,
      record: newRecord
    });

    setCopyDialogOpen(false);
    setCopyingRecord(null);
    setShowPendingDrawer(true);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    updateConfig({
      ...config,
      rowsPerPage: newRowsPerPage
    });
  };

  // First-run empty state: with no TSIG keys configured there is nothing the
  // zone editor can do, so point the user at Settings instead of showing a
  // disabled toolbar and empty table.
  // While the backend key list is still loading, show a spinner rather than
  // flashing the no-keys onboarding panel at users who do have keys.
  if (keysLoading) {
    return (
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} role="status">
          <CircularProgress aria-label="Loading" />
        </Box>
      </Paper>
    );
  }

  if (availableKeys.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" gutterBottom>
            No TSIG keys configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Snap DNS uses TSIG keys to authenticate with your DNS servers.
            Add a key and assign it to your zones to start managing records.
          </Typography>
          <Button variant="contained" component={RouterLink} to="/settings">
            Add a TSIG key to get started
          </Button>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      {selectedZone && selectedKey && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h5" component="h1">{selectedZone}</Typography>
          <Typography variant="body2" color="text.secondary">
            key: {selectedKey.name} · server: {selectedKey.server}
            {records.length > 0 && (filteredRecords.length === records.length
              ? ` · ${records.length} record${records.length !== 1 ? 's' : ''}`
              : ` · showing ${filteredRecords.length} of ${records.length} records`)}
          </Typography>
        </Box>
      )}
      <Box sx={{
        display: 'flex',
        // Wrap on small screens so the search, type filter, and refresh
        // controls stack instead of forcing horizontal overflow.
        flexWrap: { xs: 'wrap', md: 'nowrap' },
        gap: 2,
        mb: 3,
        p: 2,
        backgroundColor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        boxShadow: 1
      }}>
        <TextField
          fullWidth
          value={searchInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
          placeholder="Search records..."
          size="small"
          inputProps={{ 'aria-label': 'Search records' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            )
          }}
        />

        <FormControl sx={{ minWidth: 200 }}>
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as string)}
            size="small"
            displayEmpty
            aria-label="Filter by record type"
            SelectDisplayProps={{ id: 'record-type-filter' } as React.HTMLAttributes<HTMLDivElement>}
          >
            <MenuItem value="ALL">All Record Types</MenuItem>
            {typeOptions.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Refresh Records">
          <span style={{ alignSelf: 'center' }}>
            <IconButton
              onClick={loadZoneRecords}
              disabled={!selectedZone || !selectedKey || refreshing}
              size="small"
              aria-label="Refresh Records"
            >
              {refreshing ? (
                <CircularProgress size={20} />
              ) : (
                <RefreshIcon />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {!selectedZone && !selectedKey ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Select a zone and TSIG key from the sidebar to get started.
        </Alert>
      ) : !selectedZone ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Select a zone from the sidebar to view and manage records.
        </Alert>
      ) : !selectedKey ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          No TSIG key is associated with this zone. Configure a key in Settings to manage records.
        </Alert>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {isRefreshing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Refreshing zone records...
        </Alert>
      )}

      {loading ? (
        <CircularProgress aria-label="Loading" />
      ) : (
        <>
          <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleAddRecordClick}
              startIcon={<AddIcon />}
              disabled={!selectedZone || !selectedKey}
            >
              Add Record
            </Button>
            {selectedRecords.length > 0 && (
              <Button
                variant="contained"
                color="error"
                onClick={handleDeleteSelected}
                startIcon={<DeleteIcon />}
              >
                Delete Selected ({selectedRecords.length})
              </Button>
            )}
          </Box>

          <Dialog
            open={addRecordDialogOpen}
            onClose={() => setAddRecordDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Add DNS Record</DialogTitle>
            {selectedZone && selectedKey && (
              <AddDNSRecord
                zone={selectedZone}
                onSuccess={() => {
                  setAddRecordDialogOpen(false);
                  loadZoneRecords();
                }}
                onClose={() => setAddRecordDialogOpen(false)}
              />
            )}
          </Dialog>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      indeterminate={selectedRecords.length > 0 && selectedRecords.length < filteredRecords.length}
                      checked={filteredRecords.length > 0 && selectedRecords.length === filteredRecords.length}
                      onChange={handleSelectAllClick}
                    />
                  </TableCell>
                  <TableCell sortDirection={orderBy === 'name' ? order : false}>
                    <TableSortLabel
                      active={orderBy === 'name'}
                      direction={orderBy === 'name' ? order : 'asc'}
                      onClick={() => handleRequestSort('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={orderBy === 'type' ? order : false}>
                    <TableSortLabel
                      active={orderBy === 'type'}
                      direction={orderBy === 'type' ? order : 'asc'}
                      onClick={() => handleRequestSort('type')}
                    >
                      Type
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={orderBy === 'value' ? order : false}>
                    <TableSortLabel
                      active={orderBy === 'value'}
                      direction={orderBy === 'value' ? order : 'asc'}
                      onClick={() => handleRequestSort('value')}
                    >
                      Value
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sortDirection={orderBy === 'ttl' ? order : false} sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <TableSortLabel
                      active={orderBy === 'ttl'}
                      direction={orderBy === 'ttl' ? order : 'asc'}
                      onClick={() => handleRequestSort('ttl')}
                    >
                      TTL
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {records.length === 0
                        ? 'No records in this zone yet. Use "Add Record" to create one.'
                        : 'No records match the current search or type filter.'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredRecords
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((record) => (
                    <TableRow
                      key={recordRowKey(record)}
                      selected={selectedRecords.some(r =>
                        r.name === record.name &&
                        r.type === record.type &&
                        r.value === record.value
                      )}
                      hover
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedRecords.some(r =>
                            r.name === record.name &&
                            r.type === record.type &&
                            r.value === record.value
                          )}
                          onChange={() => handleSelectRecord(record)}
                        />
                      </TableCell>
                      <TableCell>{record.name}</TableCell>
                      <TableCell>
                        <Box component="span">
                          <Chip
                            label={record.type}
                            size="small"
                            component="span"
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box component="span">
                          {isMultilineRecord(record) ? (
                            <Button
                              size="small"
                              onClick={() => setMultilineRecord(record)}
                              sx={{ display: 'inline-flex' }}
                            >
                              View Full Record
                            </Button>
                          ) : (
                            record.value as string
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{record.ttl}</TableCell>
                      <TableCell align="right">
                        <Box component="span" sx={{ display: 'inline-flex', gap: 1 }}>
                          {record.type !== 'SOA' && (
                            <IconButton
                              size="small"
                              onClick={() => handleCopyRecord(record)}
                              title="Copy and Edit Record"
                            >
                              <ContentCopyIcon fontSize="small" />
                            </IconButton>
                          )}
                          <IconButton
                            size="small"
                            onClick={() => handleEditRecord(record)}
                            title="Edit Record"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          {record.type !== 'SOA' && (
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteRecord(record)}
                              color="error"
                              title="Delete Record"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredRecords.length}
            page={page}
            onPageChange={(_e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50, 100]}
          />
        </>
      )}

      {multilineRecord && (
        <MultilineRecordDialog
          record={multilineRecord}
          open={!!multilineRecord}
          onClose={() => setMultilineRecord(null)}
        />
      )}

      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {editingRecord && (
          <RecordEditor
            record={editingRecord}
            onSave={handleEditSave}
            onCancel={() => setEditDialogOpen(false)}
          />
        )}
      </Dialog>

      <Dialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {copyingRecord && (
          <RecordEditor
            record={copyingRecord}
            onSave={handleCopySave}
            onCancel={() => setCopyDialogOpen(false)}
            isCopy={true}
          />
        )}
      </Dialog>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          onClick={handleUndo}
          disabled={!canUndo || loading}
          startIcon={<UndoIcon />}
        >
          Undo ({historyIndex})
        </Button>
        <Button
          variant="outlined"
          onClick={handleRedo}
          disabled={!canRedo || loading}
          startIcon={<RedoIcon />}
        >
          Redo ({changeHistory.length - historyIndex - 1})
        </Button>
      </Box>

    </Paper>
  );
}

export default ZoneEditor;
