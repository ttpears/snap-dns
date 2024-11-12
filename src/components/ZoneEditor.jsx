import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Paper,
  Box,
  Typography,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Badge,
  Select,
  MenuItem,
  InputAdornment,
  IconButton,
  CircularProgress,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  Checkbox,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import AddDNSRecord from './AddDNSRecord';
import { backupService } from '../services/backupService.ts';
import { notificationService } from '../services/notificationService';
import { usePendingChanges } from '../context/PendingChangesContext';
import { qualifyDnsName } from '../utils/dnsUtils';
import { useZone } from '../context/ZoneContext';
import { PendingChangesDrawer } from './PendingChangesDrawer';
import { isMultilineRecord } from '../utils/dnsUtils';
import { RecordEditor } from './RecordEditor';

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
    
    console.log('Record in dialog:', record);
    
    if (record.type === 'SOA') {
      console.log('SOA value:', record.value);
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
  
  const { selectedZone, setSelectedZone } = useZone();

  // Add success state
  const [success, setSuccess] = useState(null);

  // All state declarations in one place
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
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentEditRecord, setCurrentEditRecord] = useState(null);
  const [multilineRecord, setMultilineRecord] = useState(null);

  // Add undo/redo history state
  const [changeHistory, setChangeHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Constants
  const recordTypes = [
    'A',
    'AAAA',
    'CNAME',
    'MX',
    'TXT',
    'SRV',
    'NS',
    'PTR',
    'CAA',
    'SSHFP',
    'SOA'
  ];

  // Computed values
  const availableZones = useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const [searchText, setSearchText] = useState('');

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const searchLower = searchText.toLowerCase();
      
      // Type filter - use exact match for record types
      if (filterType !== 'ALL' && record.type !== filterType) {
        return false;
      }

      // Text search
      if (!searchLower) return true;
      
      const nameMatch = record.name.toLowerCase().includes(searchLower);
      
      // Handle value search based on record type
      let valueMatch = false;
      if (record.type === 'SSHFP') {
        // Special handling for SSHFP record values
        const sshfpValue = String(record.value).toLowerCase();
        valueMatch = sshfpValue.includes(searchLower);
      } else if (record.type === 'SOA') {
        const soa = record.value || {};
        valueMatch = Object.values(soa).some(val => 
          String(val).toLowerCase().includes(searchLower)
        );
      } else if (typeof record.value === 'object') {
        valueMatch = JSON.stringify(record.value).toLowerCase().includes(searchLower);
      } else {
        valueMatch = String(record.value).toLowerCase().includes(searchLower);
      }

      return nameMatch || valueMatch || record.type.toLowerCase().includes(searchLower);
    });
  }, [records, searchText, filterType]);

  // Core functions
  const loadZoneRecords = useCallback(async () => {
    if (!selectedZone) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const keyConfig = config.keys.find(key => 
        key.zones?.includes(selectedZone)
      );
      
      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      // Debug log to verify key config
      console.log('Using key config:', {
        server: keyConfig.server,
        keyName: keyConfig.keyName,
        keyValue: keyConfig.keyValue,
        algorithm: keyConfig.algorithm
      });

      const records = await dnsService.fetchZoneRecords(selectedZone, keyConfig);
      setRecords(records);
    } catch (err) {
      console.error('Failed to load zone records:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedZone, config.keys]);

  // Effect to load records when zone changes
  useEffect(() => {
    if (selectedZone) {
      loadZoneRecords();
    }
  }, [selectedZone, loadZoneRecords]);

  // Record selection handlers
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

  const handleSelectAllRecords = useCallback((event) => {
    if (event.target.checked) {
      setSelectedRecords(filteredRecords);
    } else {
      setSelectedRecords([]);
    }
  }, [filteredRecords]);

  // History handlers
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

  // Add an effect to track pending changes history
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

  // UI Components
  const EditRecordDialog = () => {
    const [editedRecord, setEditedRecord] = useState(currentEditRecord);

    useEffect(() => {
      setEditedRecord(currentEditRecord);
    }, [currentEditRecord]);

    const handleSubmit = () => {
      const change = {
        type: 'MODIFY',
        zone: selectedZone,
        originalRecord: currentEditRecord,
        newRecord: editedRecord
      };
      
      addPendingChange(change);
      setEditDialogOpen(false);
    };

    return (
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit DNS Record</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={editedRecord?.name || ''}
              onChange={(e) => setEditedRecord(prev => ({
                ...prev,
                name: e.target.value
              }))}
              fullWidth
            />
            <TextField
              label="TTL"
              type="number"
              value={editedRecord?.ttl || ''}
              onChange={(e) => setEditedRecord(prev => ({
                ...prev,
                ttl: parseInt(e.target.value)
              }))}
              fullWidth
            />
            <TextField
              label="Value"
              value={editedRecord?.value || ''}
              onChange={(e) => setEditedRecord(prev => ({
                ...prev,
                value: e.target.value
              }))}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSubmit}
            color="primary"
          >
            Queue Changes
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const handleDeleteRecord = useCallback((record) => {
    if (!selectedZone || !record) {
      setError('Cannot delete record: Missing zone or record data');
      return;
    }

    const deleteChange = {
      type: 'DELETE',
      zone: selectedZone,
      record: {
        name: record.name,
        type: record.type,
        value: record.value,
        ttl: record.ttl,
        class: record.class || 'IN'
      }
    };

    console.log('Creating delete change:', deleteChange);
    addPendingChange(deleteChange);
    setShowPendingDrawer(true);
  }, [selectedZone, addPendingChange, setShowPendingDrawer]);

  const handleEditRecord = async (originalRecord, updatedRecord) => {
    try {
      setLoading(true);
      setError(null);

      const keyConfig = config.keys.find(key => 
        key.zones?.includes(selectedZone)
      );

      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      // Format the record based on its type
      const formattedRecord = formatRecordForUpdate(originalRecord, updatedRecord);

      // Add to pending changes
      addPendingChange({
        type: 'MODIFY',
        zone: selectedZone,
        originalRecord: originalRecord,
        newRecord: formattedRecord,
        keyId: keyConfig.id
      });

      setShowPendingDrawer(true);
    } catch (err) {
      console.error('Failed to edit record:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatRecordForUpdate = (originalRecord, updatedRecord) => {
    if (updatedRecord.type === 'SOA') {
      // Ensure all SOA fields are numbers where appropriate
      const soaValue = updatedRecord.value;
      return {
        ...updatedRecord,
        value: {
          mname: soaValue.mname,
          rname: soaValue.rname,
          serial: parseInt(soaValue.serial),
          refresh: parseInt(soaValue.refresh),
          retry: parseInt(soaValue.retry),
          expire: parseInt(soaValue.expire),
          minimum: parseInt(soaValue.minimum)
        }
      };
    }

    // Handle TXT and other multiline records
    if (['TXT', 'SPF'].includes(updatedRecord.type)) {
      return {
        ...updatedRecord,
        value: updatedRecord.value.trim()
      };
    }

    return updatedRecord;
  };

  const [editingRecord, setEditingRecord] = useState(null);

  const handleEditClick = (record) => {
    setEditingRecord(record);
    setEditDialogOpen(true);
  };

  const handleEditClose = () => {
    setEditingRecord(null);
    setEditDialogOpen(false);
  };

  const handleEditSave = async (updatedRecord) => {
    try {
      await handleEditRecord(editingRecord, updatedRecord);
      setEditDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      console.error('Failed to save record:', error);
      setError(error.message);
    }
  };

  // Main render method
  return (
    <Paper sx={{ p: 3 }}>
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Zone Editor</Typography>
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
          <Button
            variant="contained"
            color="primary"
            onClick={() => setShowPendingDrawer(true)}
            startIcon={
              pendingChanges.length > 0 ? (
                <Badge badgeContent={pendingChanges.length} color="error">
                  <EditIcon />
                </Badge>
              ) : (
                <EditIcon />
              )
            }
          >
            Pending Changes ({pendingChanges.length})
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Select
          value={selectedZone}
          onChange={(e) => setSelectedZone(e.target.value)}
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
          disabled={!selectedZone || loading}
        >
          <RefreshIcon />
        </IconButton>

        <Button
          variant="contained"
          onClick={() => setShowAddRecord(!showAddRecord)}
          disabled={!selectedZone}
        >
          {showAddRecord ? 'Cancel Add' : 'Add Record'}
        </Button>
      </Box>

      {searchText && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Found {filteredRecords.length} matching records
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={
                        selectedRecords.length > 0 && 
                        selectedRecords.length < filteredRecords.length
                      }
                      checked={
                        filteredRecords.length > 0 && 
                        selectedRecords.length === filteredRecords.length
                      }
                      onChange={handleSelectAllRecords}
                    />
                  </TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>TTL</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Value</TableCell>
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
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedRecords.some(r => 
                            r.name === record.name && 
                            r.type === record.type && 
                            r.value === record.value
                          )}
                          onChange={() => handleSelectRecord(record)}
                        />
                      </TableCell>
                      <TableCell>{record.name}</TableCell>
                      <TableCell>{record.ttl}</TableCell>
                      <TableCell>{record.class}</TableCell>
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
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => handleEditClick(record)}
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

      <Dialog 
        open={editDialogOpen} 
        onClose={handleEditClose}
        maxWidth="md"
        fullWidth
      >
        {editingRecord && (
          <RecordEditor
            record={editingRecord}
            onSave={handleEditSave}
            onCancel={handleEditClose}
          />
        )}
      </Dialog>

      {showAddRecord && selectedZone && (
        <AddDNSRecord 
          zone={selectedZone}
          onRecordAdded={() => {
            setShowAddRecord(false);
            loadZoneRecords();
          }}
        />
      )}

      {multilineRecord && (
        <MultilineRecordDialog
          record={multilineRecord}
          open={!!multilineRecord}
          onClose={() => setMultilineRecord(null)}
        />
      )}
    </Paper>
  );
}

export default ZoneEditor;