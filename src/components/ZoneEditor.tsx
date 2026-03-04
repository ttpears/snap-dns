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
import { backupService } from '../services/backupService';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import RecordEditor from './RecordEditor';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useKey } from '../context/KeyContext';
import PendingChangesDrawer from './PendingChangesDrawer';
import { DNSRecord } from '../types/dns';

const recordTypes = [
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SSHFP', 'SOA'
];

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

function ZoneEditor() {
  const { config, updateConfig } = useConfig();
  const {
    pendingChanges,
    setPendingChanges,
    addPendingChange,
    removePendingChange,
    clearPendingChanges,
    showPendingDrawer,
    setShowPendingDrawer
  } = usePendingChanges();

  const {
    selectedKey,
    selectedZone,
    availableZones = []
  } = useKey();

  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [filter, setFilter] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(config.rowsPerPage || 10);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedRecords, setSelectedRecords] = useState<DNSRecord[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [multilineRecord, setMultilineRecord] = useState<DNSRecord | null>(null);
  const [changeHistory, setChangeHistory] = useState<any[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [showAddRecord, setShowAddRecord] = useState<boolean>(false);
  const [addRecordDialogOpen, setAddRecordDialogOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [copyingRecord, setCopyingRecord] = useState<DNSRecord | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [orderBy, setOrderBy] = useState<SortableField>('name');
  const [order, setOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    const hasData = (config.keys?.length > 0 || availableZones.length > 0);
    setIsInitializing(!hasData);
  }, [config.keys, availableZones]);

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
      console.log('Loading records for zone:', selectedZone);
      loadZoneRecords();
    }
  }, [selectedZone, selectedKey, availableZones, isInitializing, loadZoneRecords]);

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedRecords(records);
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
        id: Date.now(),
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
      setError(`Failed to delete record: ${(error as Error).message}`);
    }
  };

  const handleDeleteSelected = async () => {
    try {
      selectedRecords.forEach(record => {
        const change = {
          id: Date.now() + Math.random(),
          type: 'DELETE' as const,
          zone: selectedZone!,
          keyId: selectedKey!.id,
          record: record
        };
        addPendingChange(change);
      });

      setShowPendingDrawer(true);
      setSelectedRecords([]);
      setEditDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      setError(`Failed to delete records: ${(error as Error).message}`);
    }
  };

  const handleEditRecord = (record: DNSRecord) => {
    setEditingRecord(record);
    setEditDialogOpen(true);
  };

  const handleEditSave = async (updatedRecord: DNSRecord) => {
    try {
      const change = {
        id: Date.now(),
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
      setError((error as Error).message);
    }
  };

  const formatRecordValue = (record: DNSRecord): string => {
    if (record.type === 'SOA') {
      const soa = record.value as any;
      return `${soa.mname} ${soa.rname} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minimum}`;
    }
    return record.value as string;
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

  const sortRecords = (records: DNSRecord[]): DNSRecord[] => {
    return records.sort((a, b) => {
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
  };

  const filteredRecords = useMemo(() => {
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

    return sortRecords(filtered);
  }, [records, searchText, filterType, order, orderBy]);

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
      const { zones } = (event as CustomEvent<{ zones: string[] }>).detail;

      if (selectedZone && zones.includes(selectedZone)) {
        setIsRefreshing(true);

        setTimeout(async () => {
          try {
            await loadZoneRecords();
          } catch (error) {
            console.error('Error refreshing zone records:', error);
            setError('Failed to refresh zone records after changes');
          } finally {
            setIsRefreshing(false);
          }
        }, 2000);
      }
    };

    window.addEventListener('dnsChangesApplied', handleChangesApplied);
    return () => window.removeEventListener('dnsChangesApplied', handleChangesApplied);
  }, [selectedZone, loadZoneRecords]);

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

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{
        display: 'flex',
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
          value={searchText || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
          placeholder="Search records..."
          size="small"
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
          >
            <MenuItem value="ALL">All Record Types</MenuItem>
            {recordTypes.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Refresh Records">
          <IconButton
            onClick={loadZoneRecords}
            disabled={!selectedZone || !selectedKey || refreshing}
            size="small"
            sx={{ alignSelf: 'center' }}
          >
            {refreshing ? (
              <CircularProgress size={20} />
            ) : (
              <RefreshIcon />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      {!selectedZone || !selectedKey ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          No TSIG key found for this zone. Please configure a key first.
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
        <CircularProgress />
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
                      indeterminate={selectedRecords.length > 0 && selectedRecords.length < records.length}
                      checked={records.length > 0 && selectedRecords.length === records.length}
                      onChange={handleSelectAllClick}
                    />
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'name'}
                      direction={orderBy === 'name' ? order : 'asc'}
                      onClick={() => handleRequestSort('name')}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'type'}
                      direction={orderBy === 'type' ? order : 'asc'}
                      onClick={() => handleRequestSort('type')}
                    >
                      Type
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'value'}
                      direction={orderBy === 'value' ? order : 'asc'}
                      onClick={() => handleRequestSort('value')}
                    >
                      Value
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
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
                {filteredRecords
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((record, index) => (
                    <TableRow
                      key={`${record.name}-${record.type}-${index}`}
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
                      <TableCell>{record.ttl}</TableCell>
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

      <PendingChangesDrawer
        open={showPendingDrawer}
        onClose={() => setShowPendingDrawer(false)}
        removePendingChange={removePendingChange}
        clearPendingChanges={clearPendingChanges}
      />
    </Paper>
  );
}

export default ZoneEditor;
