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
  Collapse,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DragDropContext,
  Droppable,
  Draggable
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
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';

function ZoneEditor() {
  // Existing viewer state
  const { config } = useConfig();
  const [selectedZone, setSelectedZone] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // New editor state
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentEditRecord, setCurrentEditRecord] = useState(null);

  // Computed values
  const previewRecords = useMemo(() => {
    let modifiedRecords = [...records];
    pendingChanges.forEach(change => {
      if (change.type === 'DELETE') {
        modifiedRecords = modifiedRecords.filter(r => !isMatchingRecord(r, change.record));
      } else if (change.type === 'MODIFY') {
        modifiedRecords = modifiedRecords.map(r => 
          isMatchingRecord(r, change.originalRecord) ? change.newRecord : r
        );
      }
    });
    return modifiedRecords;
  }, [records, pendingChanges]);

  // Helper functions
  const isMatchingRecord = (r1, r2) => {
    return r1.name === r2.name && 
           r1.type === r2.type && 
           r1.value === r2.value &&
           r1.ttl === r2.ttl;
  };

  const handleSelectRecord = (record) => {
    setSelectedRecords(prev => {
      const isSelected = prev.some(r => isMatchingRecord(r, record));
      if (isSelected) {
        return prev.filter(r => !isMatchingRecord(r, record));
      }
      return [...prev, record];
    });
  };

  const handleSelectAllRecords = (event) => {
    if (event.target.checked) {
      setSelectedRecords(filteredRecords);
    } else {
      setSelectedRecords([]);
    }
  };

  // Pending Changes Management
  const addPendingChange = (type, records, newData = null) => {
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
  };

  const removePendingChange = (changeId) => {
    setPendingChanges(prev => prev.filter(change => change.id !== changeId));
  };

  const reorderPendingChanges = (startIndex, endIndex) => {
    const result = Array.from(pendingChanges);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    setPendingChanges(result);
  };

  // Record Modification Dialog
  const EditRecordDialog = () => (
    <Dialog 
      open={editDialogOpen} 
      onClose={() => setEditDialogOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Edit DNS Record
      </DialogTitle>
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
        <Button onClick={() => setEditDialogOpen(false)}>
          Cancel
        </Button>
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

  // Pending Changes Drawer
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
          <Droppable droppableId="pending-changes">
            {(provided) => (
              <List {...provided.droppableProps} ref={provided.innerRef}>
                {pendingChanges.map((change, index) => (
                  <Draggable key={change.id} draggableId={change.id} index={index}>
                    {(provided) => (
                      <ListItem
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        divider
                      >
                        <Box {...provided.dragHandleProps} sx={{ mr: 1 }}>
                          <DragHandleIcon />
                        </Box>
                        <ListItemText
                          primary={
                            <Typography color={change.type === 'DELETE' ? 'error' : 'primary'}>
                              {change.type} - {change.originalRecord.name}
                            </Typography>
                          }
                          secondary={
                            <>
                              <Typography variant="body2">
                                Type: {change.originalRecord.type}
                              </Typography>
                              {change.type === 'MODIFY' && (
                                <Typography variant="body2" color="text.secondary">
                                  New Value: {change.newRecord.value}
                                </Typography>
                              )}
                            </>
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

  // Preview Dialog
  const PreviewDialog = () => (
    <Dialog
      open={showPreview}
      onClose={() => setShowPreview(false)}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        Preview Changes
        <Typography variant="subtitle2" color="text.secondary">
          Zone: {selectedZone}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>TTL</TableCell>
                <TableCell>Class</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Value</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRecords.map((record, index) => {
                const isModified = pendingChanges.some(change => 
                  change.type === 'MODIFY' && 
                  isMatchingRecord(change.originalRecord, record)
                );
                const isDeleted = pendingChanges.some(change =>
                  change.type === 'DELETE' &&
                  isMatchingRecord(change.originalRecord, record)
                );

                return (
                  <TableRow 
                    key={`${record.name}-${record.type}-${index}`}
                    sx={{
                      bgcolor: isDeleted ? 'error.lighter' : 
                             isModified ? 'warning.lighter' : 
                             'inherit'
                    }}
                  >
                    <TableCell>{record.name}</TableCell>
                    <TableCell>{record.ttl}</TableCell>
                    <TableCell>{record.class}</TableCell>
                    <TableCell>
                      <Chip label={record.type} size="small" />
                    </TableCell>
                    <TableCell>{record.value}</TableCell>
                    <TableCell>
                      {isDeleted ? (
                        <Chip label="To Be Deleted" color="error" size="small" />
                      ) : isModified ? (
                        <Chip label="Modified" color="warning" size="small" />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowPreview(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  // Change Application Logic
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

      // Apply changes in order
      for (const change of pendingChanges) {
        if (change.type === 'DELETE') {
          await dnsService.deleteRecord(selectedZone, change.originalRecord, keyConfig);
        } else if (change.type === 'MODIFY') {
          await dnsService.updateRecord(selectedZone, change.originalRecord, change.newRecord, keyConfig);
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

  // Main Table Rendering
  const renderRecordsTable = () => (
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
          {filteredRecords.map((record, index) => (
            <TableRow 
              key={`${record.name}-${record.type}-${index}`}
              selected={selectedRecords.some(r => isMatchingRecord(r, record))}
            >
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedRecords.some(r => isMatchingRecord(r, record))}
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
  );

  // Final Render Method
  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Zone Editor</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
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
            startIcon={pendingChanges.length > 0 ? <Badge badgeContent={pendingChanges.length} color="error"><EditIcon /></Badge> : <EditIcon />}
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
          {renderRecordsTable()}
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

      {selectedRecords.length > 0 && (
        <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}>
          <Paper sx={{ p: 2, display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => addPendingChange('DELETE', selectedRecords)}
            >
              Delete Selected
            </Button>
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={() => {
                setCurrentEditRecord(selectedRecords[0]);
                setEditDialogOpen(true);
              }}
              disabled={selectedRecords.length !== 1}
            >
              Edit Selected
            </Button>
          </Paper>
        </Box>
      )}

      <EditRecordDialog />
      <PendingChangesDrawer />
      <PreviewDialog />
    </Paper>
  );
}

export default ZoneEditor;