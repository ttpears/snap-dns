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

  const [selectedZone, setSelectedZone] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
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

  const loadZoneRecords = useCallback(async () => {
    if (!selectedZone || !selectedKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const keyConfig = config.keys.find(key => key.id === selectedKey);
      
      if (!keyConfig) {
        throw new Error('No key configuration found');
      }

      const records = await dnsService.fetchZoneRecords(selectedZone, keyConfig);
      setRecords(records);
    } catch (err) {
      console.error('Failed to load zone records:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedZone, selectedKey, config.keys]);

  useEffect(() => {
    if (selectedZone && selectedKey) {
      loadZoneRecords();
    }
  }, [selectedZone, selectedKey, loadZoneRecords]);

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
    setSelectedZone(newZone);
    setSelectedKey('');
    setSelectedRecords([]);
  };

  const handleKeyChange = (event) => {
    setSelectedKey(event.target.value);
    setSelectedRecords([]);
  };

  const handleDeleteRecord = async (record) => {
    try {
      const change = {
        id: Date.now(),
        type: 'DELETE',
        zone: selectedZone,
        keyId: selectedKey,
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
          keyId: selectedKey,
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
        keyId: selectedKey,
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

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Select
          value={selectedZone}
          onChange={(e) => {
            setSelectedZone(e.target.value);
            setSelectedKey('');
          }}
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
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          displayEmpty
          fullWidth
          disabled={!selectedZone}
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
          disabled={!selectedZone || !selectedKey || loading}
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={() => setShowAddRecord(true)}
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

          {showAddRecord && selectedZone && selectedKey && (
            <AddDNSRecord 
              zone={selectedZone}
              selectedKey={selectedKey}
              onRecordAdded={() => {
                setShowAddRecord(false);
                loadZoneRecords();
              }}
              pendingChanges={pendingChanges}
              addPendingChange={addPendingChange}
              setShowPendingDrawer={setShowPendingDrawer}
            />
          )}

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
                        <Chip label={record.type} size="small" />
                      </TableCell>
                      <TableCell>
                        {isMultilineRecord(record) ? (
                          <Button 
                            size="small" 
                            onClick={() => setMultilineRecord(record)}
                          >
                            View Full Record
                          </Button>
                        ) : (
                          record.value
                        )}
                      </TableCell>
                      <TableCell>{record.ttl}</TableCell>
                      <TableCell align="right">
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