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

function ZoneEditor() {
  const { config } = useConfig();
  
  // Basic state
  const [selectedZone, setSelectedZone] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [showAddRecord, setShowAddRecord] = useState(false);
  
  // Selection and editing state
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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

  // Pending changes handlers
  const addPendingChange = useCallback((type, records, newData = null) => {
    setPendingChanges(prev => [
      ...prev,
      ...records.map(record => ({
        id: `change-${Date.now()}-${Math.random()}`,
        type,
        originalRecord: record,
        newRecord: newData || record,
        timestamp: Date.now()
      }))
    ]);
    setSelectedRecords([]);
  }, []);

  const removePendingChange = useCallback((changeId) => {
    setPendingChanges(prev => prev.filter(change => change.id !== changeId));
  }, []);

  const reorderPendingChanges = useCallback((startIndex, endIndex) => {
    setPendingChanges(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

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
  const EditRecordDialog = () => (
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
            value={currentEditRecord?.name || ''}
            onChange={(e) => setCurrentEditRecord(prev => ({
              ...prev,
              name: e.target.value
            }))}
            fullWidth
          />
          <TextField
            label="TTL"
            type="number"
            value={currentEditRecord?.ttl || ''}
            onChange={(e) => setCurrentEditRecord(prev => ({
              ...prev,
              ttl: parseInt(e.target.value)
            }))}
            fullWidth
          />
          <TextField
            label="Value"
            value={currentEditRecord?.value || ''}
            onChange={(e) => setCurrentEditRecord(prev => ({
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
          onClick={() => {
            addPendingChange('MODIFY', [currentEditRecord], currentEditRecord);
            setEditDialogOpen(false);
          }}
          color="primary"
        >
          Queue Changes
        </Button>
      </DialogActions>
    </Dialog>
  );

  const PendingChangesDrawer = () => (
    <Drawer
      anchor="right"
      open={showPendingDrawer}
      onClose={() => setShowPendingDrawer(false)}
      sx={{ width: 400 }}
    >
      <Box sx={{ width: 400, p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Pending Changes ({pendingChanges.length})
        </Typography>
        <DragDropContext onDragEnd={({ source, destination }) => {
          if (!destination) return;
          reorderPendingChanges(source.index, destination.index);
        }}>
          <Droppable droppableId="pending-changes" type="pending-change">
            {(provided, snapshot) => (
              <List 
                ref={provided.innerRef}
                {...provided.droppableProps}
                sx={{
                  bgcolor: snapshot.isDraggingOver ? 'action.hover' : 'background.paper'
                }}
              >
                {pendingChanges.map((change, index) => (
                  <Draggable key={change.id} draggableId={change.id} index={index}>
                    {(provided, snapshot) => (
                      <ListItem
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        divider
                        sx={{
                          bgcolor: snapshot.isDragging ? 'action.selected' : 'inherit'
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box component="span" sx={{ color: change.type === 'DELETE' ? 'error.main' : 'primary.main' }}>
                              {change.type} - {change.originalRecord.name}
                            </Box>
                          }
                          secondary={
                            <Box component="span">
                              <Box component="span" display="block">
                                Type: {change.originalRecord.type}
                              </Box>
                              {change.type === 'MODIFY' && (
                                <Box component="span" display="block" sx={{ color: 'text.secondary' }}>
                                  New Value: {change.newRecord.value}
                                </Box>
                              )}
                            </Box>
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton 
                            edge="end" 
                            onClick={() => removePendingChange(change.id)}
                          >
                            <CancelIcon />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </List>
            )}
          </Droppable>
        </DragDropContext>
        
        {pendingChanges.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              onClick={applyChanges}
            >
              Apply Changes
            </Button>
            <Button
              variant="outlined"
              startIcon={<PreviewIcon />}
              onClick={() => setShowPreview(true)}
            >
              Preview
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );

  // Add the applyChanges function
  const applyChanges = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const keyConfig = config.keys.find(key => 
        key.zones?.includes(selectedZone)
      );
      
      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      // Save current state to history before applying changes
      saveToHistory({
        records: [...records],
        timestamp: new Date().toISOString()
      });

      // Apply changes in order
      for (const change of pendingChanges) {
        if (change.type === 'DELETE') {
          await dnsService.deleteRecord(selectedZone, change.originalRecord, keyConfig);
        } else if (change.type === 'MODIFY') {
          await dnsService.updateRecord(
            selectedZone, 
            change.originalRecord, 
            change.newRecord, 
            keyConfig
          );
        }
      }

      // Clear pending changes and refresh zone data
      setPendingChanges([]);
      await loadZoneRecords();
      setShowPendingDrawer(false);
    } catch (err) {
      setError(`Failed to apply changes: ${err.message}`);
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
        {/* Preview content */}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowPreview(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  // Main render method
  return (
    <Paper sx={{ p: 3 }}>
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
            onClick={() => setShowPreview(true)}
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
                          onClick={() => addPendingChange('DELETE', [record])}
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