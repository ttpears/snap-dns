import React, { useState, useEffect, useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Grid,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  Checkbox,
  FormControlLabel,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  AutoMode as AutoModeIcon,
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { backupService } from '../services/backupService.ts';
import { notificationService } from '../services/notificationService';

function BackupImport() {
  const { config } = useConfig();
  const [selectedZone, setSelectedZone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [backupData, setBackupData] = useState(null);
  const [storedBackups, setStoredBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [recordFilter, setRecordFilter] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [confirmFullRestore, setConfirmFullRestore] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectAll, setSelectAll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = () => {
    const backups = backupService.getBackups();
    setStoredBackups(backups);
  };

  // Get available zones from config
  const availableZones = React.useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const handleBackup = async () => {
    if (!selectedZone) {
      setError('Please select a zone to backup');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const keyConfig = config.keys.find(key => 
        key.zones?.includes(selectedZone)
      );

      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      const records = await dnsService.fetchZoneRecords(selectedZone, keyConfig);
      
      const backup = await backupService.createBackup(selectedZone, records, {
        type: 'manual',
        description: 'Manual backup',
        server: keyConfig.server,
        config: config
      });

      backupService.downloadBackup(backup);
      setStoredBackups(backupService.getBackups());
      setSuccess('Backup created and saved successfully');
    } catch (err) {
      console.error('Backup failed:', err);
      setError(`Failed to create backup: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = await backupService.importBackup(file, config);
        setBackupData(backup);
        setImportDialogOpen(true);
      } catch (err) {
        setError('Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreSelection = (backup) => {
    setSelectedBackup(backup);
    setSelectedRecords([]); // Reset selection
  };

  const handleRecordSelection = (record) => {
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
  };

  const filteredRecords = React.useMemo(() => {
    if (!selectedBackup) return [];
    return selectedBackup.records.filter(record => {
      const matchesFilter = !recordFilter || 
        record.name.toLowerCase().includes(recordFilter.toLowerCase()) ||
        record.value.toLowerCase().includes(recordFilter.toLowerCase());
      const matchesType = selectedTypes.length === 0 || 
        selectedTypes.includes(record.type);
      return matchesFilter && matchesType;
    });
  }, [selectedBackup, recordFilter, selectedTypes]);

  const handleRestore = async () => {
    if (!selectedBackup || (!selectedRecords.length && !confirmFullRestore)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const keyConfig = config.keys.find(key => 
        key.zones?.includes(selectedBackup.zone)
      );

      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      const recordsToRestore = selectedRecords.length ? selectedRecords : selectedBackup.records;
      await dnsService.restoreZone(selectedBackup.zone, recordsToRestore, keyConfig);
      
      // Send notification about the restore
      await notificationService.notifyRestoreCompleted(
        selectedBackup.zone, 
        recordsToRestore.length
      );

      setSuccess('Records restored successfully');
      setSelectedBackup(null);
      setSelectedRecords([]);
      setConfirmDialogOpen(false);
    } catch (error) {
      setError(`Failed to restore records: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBackup = async (backup) => {
    if (window.confirm('Are you sure you want to delete this backup?')) {
      try {
        // Pass the entire backup object
        await backupService.deleteBackup(backup.timestamp);
        loadBackups(); // Reload the backups list
        setSuccess('Backup deleted successfully');
      } catch (error) {
        setError('Failed to delete backup');
        console.error('Delete backup error:', error);
      }
    }
  };

  const handleImportBackup = (backup) => {
    setSelectedBackup(backup);
    setSelectedRecords([]);
    setConfirmDialogOpen(true);
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleDownloadBackup = (backup) => {
    try {
      backupService.downloadBackup(backup);
    } catch (error) {
      setError(`Failed to download backup: ${error.message}`);
    }
  };

  const handleRestoreClick = (backup) => {
    setSelectedBackupForRestore(backup);
    setSelectedRecords(new Set(backup.records.map((_, index) => index)));
    setSelectAll(true);
    setPage(0);
    setRestoreDialogOpen(true);
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedRecords(new Set(selectedBackupForRestore.records.map((_, index) => index)));
      setSelectAll(true);
    } else {
      setSelectedRecords(new Set());
      setSelectAll(false);
    }
  };

  const handleSelectRecord = (index) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRecords(newSelected);
    setSelectAll(newSelected.size === selectedBackupForRestore?.records.length);
  };

  const handleRestoreConfirm = async () => {
    if (!selectedBackupForRestore) return;

    setLoading(true);
    setError(null);
    try {
      const recordsToRestore = selectedBackupForRestore.records.filter((_, index) => 
        selectedRecords.has(index)
      );
      
      await backupService.restoreRecords(
        selectedBackupForRestore, 
        config,
        recordsToRestore
      );
      
      setSuccess('Backup restored successfully');
      setRestoreDialogOpen(false);
    } catch (err) {
      setError(`Failed to restore backup: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Get unique zones from backups
  const availableZonesInBackups = useMemo(() => {
    const zones = new Set(storedBackups.map(backup => backup.zone));
    return ['all', ...Array.from(zones)];
  }, [storedBackups]);

  // Group backups by date
  const groupedBackups = useMemo(() => {
    const filtered = storedBackups
      .filter(backup => {
        const matchesSearch = searchTerm === '' || 
          backup.zone.toLowerCase().includes(searchTerm.toLowerCase()) ||
          backup.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesZone = filterZone === 'all' || backup.zone === filterZone;
        return matchesSearch && matchesZone;
      });

    // Sort backups
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        return sortOrder === 'desc' 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      } else if (sortBy === 'zone') {
        return sortOrder === 'desc'
          ? b.zone.localeCompare(a.zone)
          : a.zone.localeCompare(b.zone);
      }
      return 0;
    });

    // Group by date
    const groups = sorted.reduce((acc, backup) => {
      const date = new Date(backup.timestamp).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(backup);
      return acc;
    }, {});

    return groups;
  }, [storedBackups, searchTerm, filterZone, sortBy, sortOrder]);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Backup & Import
      </Typography>

      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Select Zone</InputLabel>
          <Select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            label="Select Zone"
          >
            {availableZones.map((zone) => (
              <MenuItem key={zone} value={zone}>
                {zone}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<BackupIcon />}
            onClick={handleBackup}
            disabled={loading || !selectedZone}
          >
            Backup Zone
          </Button>

          <Button
            variant="contained"
            component="label"
            startIcon={<RestoreIcon />}
            disabled={loading}
          >
            Import Backup
            <input
              type="file"
              hidden
              accept=".json"
              onChange={handleImportFile}
            />
          </Button>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress />
        </Box>
      )}

      {storedBackups.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Stored Backups
          </Typography>
          
          {/* Search and Filter Controls */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search backups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter by Zone</InputLabel>
                <Select
                  value={filterZone}
                  onChange={(e) => setFilterZone(e.target.value)}
                  label="Filter by Zone"
                >
                  {availableZonesInBackups.map(zone => (
                    <MenuItem key={zone} value={zone}>
                      {zone === 'all' ? 'All Zones' : zone}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort by</InputLabel>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  label="Sort by"
                >
                  <MenuItem value="date">Date</MenuItem>
                  <MenuItem value="zone">Zone</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Order</InputLabel>
                <Select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  label="Order"
                >
                  <MenuItem value="desc">Newest First</MenuItem>
                  <MenuItem value="asc">Oldest First</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Backup Groups */}
          {Object.entries(groupedBackups).map(([date, backups]) => (
            <Accordion key={date} defaultExpanded={date === Object.keys(groupedBackups)[0]}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography>{date}</Typography>
                  <Chip 
                    size="small" 
                    label={`${backups.length} backup${backups.length !== 1 ? 's' : ''}`}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {backups.map((backup) => (
                    <Grid item xs={12} md={6} key={backup.id}>
                      <Paper 
                        elevation={2} 
                        sx={{ 
                          p: 2,
                          backgroundColor: 'background.default',
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          }
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Typography variant="subtitle1" color="primary">
                                {backup.zone}
                              </Typography>
                              <Tooltip title={backup.type === 'auto' ? 'Automatic backup' : 'Manual backup'}>
                                {backup.type === 'auto' ? 
                                  <AutoModeIcon fontSize="small" color="action" /> : 
                                  <BackupIcon fontSize="small" color="action" />
                                }
                              </Tooltip>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {new Date(backup.timestamp).toLocaleTimeString()}
                            </Typography>
                            <Typography variant="body2">
                              Records: {backup.records.length}
                            </Typography>
                            {backup.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {backup.description}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Download backup">
                              <IconButton
                                size="small"
                                onClick={() => handleDownloadBackup(backup)}
                              >
                                <DownloadIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Restore this backup">
                              <IconButton
                                size="small"
                                onClick={() => handleRestoreClick(backup)}
                              >
                                <RestoreIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete backup">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteBackup(backup)}
                                color="error"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={restoreDialogOpen}
        onClose={() => setRestoreDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Restore Backup</DialogTitle>
        <DialogContent>
          {selectedBackupForRestore && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1">
                  Zone: {selectedBackupForRestore.zone}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Created: {new Date(selectedBackupForRestore.timestamp).toLocaleString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Records: {selectedBackupForRestore.records.length}
                </Typography>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectAll}
                    indeterminate={selectedRecords.size > 0 && selectedRecords.size < selectedBackupForRestore.records.length}
                    onChange={handleSelectAll}
                  />
                }
                label="Select All Records"
              />

              <TableContainer sx={{ maxHeight: 400 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectAll}
                          indeterminate={selectedRecords.size > 0 && selectedRecords.size < selectedBackupForRestore.records.length}
                          onChange={handleSelectAll}
                        />
                      </TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>TTL</TableCell>
                      <TableCell>Class</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedBackupForRestore.records
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((record, index) => {
                        const actualIndex = page * rowsPerPage + index;
                        // Format the value based on record type
                        let displayValue = record.value;
                        if (record.type === 'SOA' && typeof record.value === 'object') {
                          displayValue = `${record.value.mname} ${record.value.rname} ${record.value.serial} ${record.value.refresh} ${record.value.retry} ${record.value.expire} ${record.value.minimum}`;
                        }
                        
                        return (
                          <TableRow 
                            key={`${record.name}-${record.type}-${actualIndex}`}
                            hover
                            onClick={() => handleSelectRecord(actualIndex)}
                            role="checkbox"
                            selected={selectedRecords.has(actualIndex)}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={selectedRecords.has(actualIndex)}
                                onChange={() => handleSelectRecord(actualIndex)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </TableCell>
                            <TableCell>{record.name}</TableCell>
                            <TableCell>{record.ttl}</TableCell>
                            <TableCell>{record.class || 'IN'}</TableCell>
                            <TableCell>{record.type}</TableCell>
                            <TableCell 
                              sx={{ 
                                maxWidth: 300, 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' 
                              }}
                            >
                              {displayValue}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={selectedBackupForRestore.records.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setRestoreDialogOpen(false);
              setSelectedRecords(new Set());
              setPage(0);
            }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleRestoreConfirm}
            variant="contained"
            color="primary"
            disabled={loading || selectedRecords.size === 0}
            startIcon={loading ? <CircularProgress size={20} /> : <RestoreIcon />}
          >
            Restore {selectedRecords.size} Record{selectedRecords.size !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}
    </Paper>
  );
}

export default BackupImport; 