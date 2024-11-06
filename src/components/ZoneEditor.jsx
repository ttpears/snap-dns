import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Box,
  Chip,
  InputAdornment,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  Tooltip,
  Checkbox,
  Button,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Badge,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  DragHandle as DragHandleIcon,
  Preview as PreviewIcon,
  Cancel as CancelIcon,
  Save as SaveIcon,
  Undo as UndoIcon,
  Redo as RedoIcon,
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import AddDNSRecord from './AddDNSRecord';
import { backupService } from '../services/backupService';
import { notificationService } from '../services/notificationService';
import { usePendingChanges } from '../context/PendingChangesContext';
import { qualifyDnsName } from '../utils/dnsUtils';

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
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedTypes, setSelectedTypes] = useState([]);

  // Basic state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [showAddRecord, setShowAddRecord] = useState(false);
  
  // Selection and editing state
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentEditRecord, setCurrentEditRecord] = useState(null);
  
  // History state
  const [changeHistory, setChangeHistory] = useState([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);

  // Constants
  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA'];

  // Computed values
  const availableZones = useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const matchesSearch = searchTerm === '' ||
        record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.value.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'ALL' || record.type === filterType;
      
      return matchesSearch && matchesType;
    });
  }, [records, searchTerm, filterType]);

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
  const saveToHistory = useCallback((zoneData) => {
    setChangeHistory(prev => {
      const newHistory = prev.slice(0, currentHistoryIndex + 1);
      return [...newHistory, zoneData];
    });
    setCurrentHistoryIndex(prev => prev + 1);
  }, [currentHistoryIndex]);

  const canUndo = currentHistoryIndex > 0;
  const canRedo = currentHistoryIndex < changeHistory.length - 1;

  const undo = useCallback(async () => {
    if (!canUndo) return;
    
    try {
      setLoading(true);
      const previousState = changeHistory[currentHistoryIndex - 1];
      setRecords(previousState.records);
      setCurrentHistoryIndex(prev => prev - 1);
    } catch (err) {
      setError('Failed to undo changes');
    } finally {
      setLoading(false);
    }
  }, [canUndo, changeHistory, currentHistoryIndex]);

  const redo = useCallback(async () => {
    if (!canRedo) return;
    
    try {
      setLoading(true);
      const nextState = changeHistory[currentHistoryIndex + 1];
      setRecords(nextState.records);
      setCurrentHistoryIndex(prev => prev + 1);
    } catch (err) {
      setError('Failed to redo changes');
    } finally {
      setLoading(false);
    }
  }, [canRedo, changeHistory, currentHistoryIndex]);

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

  const PendingChangesDrawer = () => (
    <Drawer
      anchor="right"
      open={showPendingDrawer}
      onClose={() => setShowPendingDrawer(false)}
    >
      <Box sx={{ width: 400, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ 
          p: 2, 
          borderBottom: 1, 
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          position: 'sticky',
          top: 0,
          zIndex: 1
        }}>
          <Typography variant="h6">Pending Changes</Typography>
        </Box>

        <Box sx={{ p: 2, mt: 1, flexGrow: 1, overflowY: 'auto' }}>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="pending-changes">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {pendingChanges.map((change, index) => (
                    <Draggable
                      key={change.id}
                      draggableId={String(change.id)}
                      index={index}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <Alert 
                            severity="info" 
                            sx={{ mb: 1 }}
                            action={
                              <IconButton
                                size="small"
                                onClick={() => removePendingChange(change.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            }
                          >
                            {change.type === 'DELETE' && (
                              `DELETE: ${change.record.name} ${change.record.ttl} ${change.record.type} ${change.record.value}`
                            )}
                            {change.type === 'ADD' && (
                              `ADD: ${change.name} ${change.ttl} ${change.recordType} ${change.value}`
                            )}
                            {change.type === 'MODIFY' && (
                              `MODIFY: ${change.originalRecord.name}\n` +
                              `FROM: ${change.originalRecord.ttl} ${change.originalRecord.type} ${change.originalRecord.value}\n` +
                              `TO: ${change.newRecord.ttl} ${change.newRecord.type} ${change.newRecord.value}`
                            )}
                          </Alert>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </Box>

        <Box sx={{ 
          p: 2, 
          borderTop: 1, 
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <Button 
            onClick={() => setShowPendingDrawer(false)}
            variant="outlined"
          >
            Close
          </Button>
          <Button
            onClick={applyChanges}
            variant="contained"
            color="primary"
            disabled={pendingChanges.length === 0 || loading}
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            Apply Changes
          </Button>
        </Box>
      </Box>
    </Drawer>
  );

  // Add the applyChanges function
  const applyChanges = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get the key configuration for the selected zone
      const keyConfig = config.keys.find(key => key.zones.includes(selectedZone));
      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      // Apply each change
      for (const change of pendingChanges) {
        switch (change.type) {
          case 'ADD':
            await dnsService.addRecord(selectedZone, {
              name: change.name,
              type: change.recordType,
              value: change.value,
              ttl: change.ttl
            }, keyConfig);
            break;
          case 'MODIFY':
            await dnsService.updateRecord(selectedZone, change.originalRecord, change.newRecord, keyConfig);
            break;
          case 'DELETE':
            await dnsService.deleteRecord(selectedZone, change.record, keyConfig);
            break;
          default:
            console.warn('Unknown change type:', change.type);
        }
      }

      // Send notification after all changes are applied
      if (config.webhookUrl) {
        try {
          await notificationService.sendNotification(selectedZone, pendingChanges);
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
          // Don't throw here, as the changes were successful
        }
      }

      // Clear pending changes
      clearPendingChanges();
      setShowPendingDrawer(false);
      
      // Show success message
      setSuccess('Changes applied successfully');
    } catch (error) {
      console.error('Failed to apply changes:', error);
      setError(`Failed to apply changes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Add PreviewDialog component
  const PreviewDialog = () => (
    <Dialog
      open={showPreview}
      onClose={() => setShowPreview(false)}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>Preview Changes</DialogTitle>
      <DialogContent>
        <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {previewContent || 'No changes to preview'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowPreview(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  const [previewContent, setPreviewContent] = useState('');

  const handlePreviewChanges = () => {
    const preview = pendingChanges.map(change => {
      if (change.type === 'ADD') {
        const fqdn = qualifyDnsName(change.name, change.zone);
        return `ADD: ${fqdn} ${change.ttl} ${change.recordType} ${change.value}`;
      } else if (change.type === 'DELETE') {
        // Use the record's full name and ensure all fields are included
        const fqdn = qualifyDnsName(change.record.name, change.zone);
        return `DELETE: ${fqdn} ${change.record.ttl} ${change.record.class || 'IN'} ${change.record.type} ${change.record.value}`;
      } else if (change.type === 'MODIFY') {
        const fqdn = qualifyDnsName(change.originalRecord.name, change.zone);
        return `MODIFY: ${fqdn}\n` +
               `  FROM: ${change.originalRecord.ttl} ${change.originalRecord.type} ${change.originalRecord.value}\n` +
               `  TO: ${change.newRecord.ttl} ${change.newRecord.type} ${change.newRecord.value}`;
      }
      return '';
    }).join('\n\n');

    setPreviewContent(preview);
    setShowPreview(true);
  };

  // Add reorderPendingChanges function
  const reorderPendingChanges = useCallback((startIndex, endIndex) => {
    setPendingChanges(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, [setPendingChanges]);

  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    reorderPendingChanges(
      result.source.index,
      result.destination.index
    );
  };

  // Add success state
  const [success, setSuccess] = useState(null);

  // Add success alert display
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Add this with the other handlers near the top of the ZoneEditor function
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
            onClick={undo}
            disabled={!canUndo || loading}
            startIcon={<UndoIcon />}
          >
            Undo
          </Button>
          <Button
            variant="outlined"
            onClick={redo}
            disabled={!canRedo || loading}
            startIcon={<RedoIcon />}
          >
            Redo
          </Button>
          <Button
            variant="outlined"
            startIcon={<PreviewIcon />}
            onClick={handlePreviewChanges}
            disabled={pendingChanges.length === 0}
          >
            Preview Changes
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
            Pending Changes
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
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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
                      <TableCell>{record.value}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setCurrentEditRecord(record);
                            setEditDialogOpen(true);
                          }}
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

      <EditRecordDialog />
      <PendingChangesDrawer />
      <PreviewDialog />

      {showAddRecord && selectedZone && (
        <AddDNSRecord 
          zone={selectedZone}
          onRecordAdded={() => {
            setShowAddRecord(false);
            loadZoneRecords();
          }}
        />
      )}
    </Paper>
  );
}

export default ZoneEditor;