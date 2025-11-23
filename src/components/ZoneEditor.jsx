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
  InputLabel,
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

const recordTypes = [
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SSHFP', 'SOA'
];

function MultilineRecordDialog({ record, open, onClose }) {
  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    
    return parts.join(' ') || `${seconds} seconds`;
  };

  const formattedValue = useMemo(() => {
    if (!record) return '';
    
    if (record.type === 'SOA') {
      const soa = record.value || {};
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
            backgroundColor: (theme) => 
              theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
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

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(config.rowsPerPage || 10);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [multilineRecord, setMultilineRecord] = useState(null);
  const [changeHistory, setChangeHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [addRecordDialogOpen, setAddRecordDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copyingRecord, setCopyingRecord] = useState(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');

  // Update initialization effect
  useEffect(() => {
    // Set initializing based on whether we have keys and zones available
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
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [selectedZone, selectedKey]);

  useEffect(() => {
    // Only load if we have all required data and zone is valid
    if (selectedZone &&
        selectedKey &&
        availableZones.includes(selectedZone) &&
        !isInitializing) {
      console.log('Loading records for zone:', selectedZone);
      loadZoneRecords();
    }
  }, [selectedZone, selectedKey, availableZones, isInitializing, loadZoneRecords]);

  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      setSelectedRecords(records);
    } else {
      setSelectedRecords([]);
    }
  };

  const handleSelectRecord = useCallback((record) => {
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

  const handleDeleteRecord = async (record) => {
    try {
      const change = {
        id: Date.now(),
        type: 'DELETE',
        zone: selectedZone,
        keyId: selectedKey.id,
        record: record
      };

      addPendingChange(change);
      setShowPendingDrawer(true);
      setEditDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      setError(`Failed to delete record: ${error.message}`);
    }
  };

  const handleDeleteSelected = async () => {
    try {
      selectedRecords.forEach(record => {
        const change = {
          id: Date.now() + Math.random(),
          type: 'DELETE',
          zone: selectedZone,
          keyId: selectedKey.id,
          record: record
        };
        addPendingChange(change);
      });

      setShowPendingDrawer(true);
      setSelectedRecords([]);
      setEditDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      setError(`Failed to delete records: ${error.message}`);
    }
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setEditDialogOpen(true);
  };

  const handleEditSave = async (updatedRecord) => {
    try {
      const change = {
        id: Date.now(),
        type: 'MODIFY',
        zone: selectedZone,
        keyId: selectedKey.id,
        originalRecord: editingRecord,
        newRecord: updatedRecord
      };
      
      addPendingChange(change);
      setShowPendingDrawer(true);
      setEditDialogOpen(false);
      setEditingRecord(null);
      setCopyDialogOpen(false);
      setCopyingRecord(null);
    } catch (error) {
      setError(error.message);
    }
  };

  const formatRecordValue = (record) => {
    if (record.type === 'SOA') {
      const soa = record.value;
      return `${soa.mname} ${soa.rname} ${soa.serial} ${soa.refresh} ${soa.retry} ${soa.expire} ${soa.minimum}`;
    }
    return record.value;
  };

  const isMultilineRecord = (record) => {
    if (!record) return false;
    
    // SOA records are always shown in the modal
    if (record.type === 'SOA') return true;
    
    // TXT records with long values
    if (record.type === 'TXT' && record.value.length > 40) return true;
    
    // Any record with an object value
    if (typeof record.value === 'object') return true;
    
    return false;
  };

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortRecords = (records) => {
    return records.sort((a, b) => {
      let aValue = a[orderBy];
      let bValue = b[orderBy];

      // Special handling for different types of values
      if (orderBy === 'value') {
        if (typeof aValue === 'object') aValue = JSON.stringify(aValue);
        if (typeof bValue === 'object') bValue = JSON.stringify(bValue);
      }

      // Convert to strings for comparison
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();

      // Handle numeric parts in strings
      if (aValue.match(/^\d+/) && bValue.match(/^\d+/)) {
        const aNum = parseInt(aValue.match(/^\d+/)[0]);
        const bNum = parseInt(bValue.match(/^\d+/)[0]);
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
      
      // Type filter
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
        // Remove any future states if we're not at the end
        const newHistory = prev.slice(0, historyIndex + 1);
        // Add current changes as new state
        return [...newHistory, [...pendingChanges]];
      });
      setHistoryIndex(prev => prev + 1);
    }
  }, [pendingChanges, historyIndex]);

  const handleAddRecordClick = () => {
    setAddRecordDialogOpen(true);
  };

  // Add effect to listen for applied changes
  useEffect(() => {
    const handleChangesApplied = (event) => {
      const { zones } = event.detail;
      
      if (selectedZone && zones.includes(selectedZone)) {
        setIsRefreshing(true);
        
        // Add a delay to allow DNS propagation
        setTimeout(async () => {
          try {
            await loadZoneRecords();
          } catch (error) {
            console.error('Error refreshing zone records:', error);
            setError('Failed to refresh zone records after changes');
          } finally {
            setIsRefreshing(false);
          }
        }, 2000); // 2 second delay
      }
    };

    window.addEventListener('dnsChangesApplied', handleChangesApplied);
    return () => window.removeEventListener('dnsChangesApplied', handleChangesApplied);
  }, [selectedZone, loadZoneRecords]);

  const handleCopyRecord = (record) => {
    setCopyingRecord({
      ...record,
      id: undefined,
      name: `${record.name}`
    });
    setCopyDialogOpen(true);
  };

  const handleCopySave = (newRecord) => {
    addPendingChange({
      type: 'ADD',
      zone: selectedZone,
      keyId: selectedKey.id,
      record: newRecord
    });

    setCopyDialogOpen(false);
    setCopyingRecord(null);
    setShowPendingDrawer(true);
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    // Save to config
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
          onChange={(e) => setSearchText(e.target.value)}
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
            onChange={(e) => setFilterType(e.target.value)}
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
                            record.value
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
            onPageChange={(e, newPage) => setPage(newPage)}
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
            selectedKey={selectedKey}
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