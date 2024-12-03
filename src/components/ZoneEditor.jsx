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
  Chip
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
  const { config } = useConfig();
  const { 
    pendingChanges, 
    addPendingChange, 
    removePendingChange, 
    clearPendingChanges, 
    showPendingDrawer, 
    setShowPendingDrawer,
    setPendingChanges 
  } = usePendingChanges();

  const { selectedKey, selectedZone, selectKey, selectZone } = useKey();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [multilineRecord, setMultilineRecord] = useState(null);
  const [changeHistory, setChangeHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [searchText, setSearchText] = useState('');
  const recordTypes = [
    'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SSHFP', 'SOA'
  ];
  const [addRecordDialogOpen, setAddRecordDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copyingRecord, setCopyingRecord] = useState(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  // Add loading state for initial data
  const [isInitializing, setIsInitializing] = useState(true);

  const availableZones = useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const availableKeys = useMemo(() => {
    if (!selectedZone) return [];
    return config.keys?.filter(key => key.zones?.includes(selectedZone)) || [];
  }, [selectedZone, config.keys]);

  // Add initialization effect
  useEffect(() => {
    if (config.keys && availableZones.length > 0) {
      setIsInitializing(false);
    }
  }, [config.keys, availableZones]);

  const loadZoneRecords = useCallback(async () => {
    if (!selectedZone || !selectedKey) return;
    
    setRefreshing(true);
    setError(null);
    
    try {
      const records = await dnsService.fetchZoneRecords(selectedZone, selectedKey);
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

  const handleZoneChange = (event) => {
    const newZone = event.target.value;
    selectZone(newZone);
    selectKey(null);
    setSelectedRecords([]);
  };

  const handleKeyChange = (event) => {
    const key = availableKeys.find(k => k.id === event.target.value);
    selectKey(key);
    setSelectedRecords([]);
  };

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

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
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
  }, [records, searchText, filterType]);

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
    // Add the new record to pending changes
    addPendingChange({
      type: 'ADD',
      zone: selectedZone,
      keyId: selectedKey.id,
      record: newRecord
    });

    // Close the dialog
    setCopyDialogOpen(false);

    // Show the pending changes drawer
    setShowPendingDrawer(true);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Select
          value={isInitializing ? '' : (selectedZone || '')}
          onChange={handleZoneChange}
          displayEmpty
          fullWidth
        >
          <MenuItem value="" disabled>
            Select a DNS Zone
          </MenuItem>
          {availableZones.map((zone) => (
            <MenuItem key={zone} value={zone}>
              {zone}
            </MenuItem>
          ))}
        </Select>

        <Select
          value={isInitializing ? '' : (selectedKey?.id || '')}
          onChange={handleKeyChange}
          displayEmpty
          fullWidth
          disabled={!selectedZone || availableKeys.length === 0}
        >
          <MenuItem value="" disabled>
            Select a DNS Key
          </MenuItem>
          {availableKeys.map((key) => (
            <MenuItem key={key.id} value={key.id}>
              {key.name || key.id}
            </MenuItem>
          ))}
        </Select>

        <TextField
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search records..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            )
          }}
        />

        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <MenuItem value="ALL">All Types</MenuItem>
          {recordTypes.map(type => (
            <MenuItem key={type} value={type}>{type}</MenuItem>
          ))}
        </Select>

        <IconButton 
          onClick={loadZoneRecords} 
          disabled={!selectedZone || !selectedKey || refreshing}
        >
          {refreshing ? (
            <CircularProgress size={24} />
          ) : (
            <RefreshIcon />
          )}
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

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
                selectedKey={selectedKey}
                onRecordAdded={() => {
                  setAddRecordDialogOpen(false);
                  loadZoneRecords();
                }}
                addPendingChange={addPendingChange}
                setShowPendingDrawer={setShowPendingDrawer}
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
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell>TTL</TableCell>
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
                          <IconButton
                            size="small"
                            onClick={() => handleCopyRecord(record)}
                            title="Copy and Edit Record"
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleEditRecord(record)}
                            title="Edit Record"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteRecord(record)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
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
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
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
    </Paper>
  );
}

export default ZoneEditor;