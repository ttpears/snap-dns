import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { backupService } from '../services/backupService';
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

  useEffect(() => {
    setStoredBackups(backupService.getBackups());
  }, []);

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
      
      // Create backup object with metadata
      const backup = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        zone: selectedZone,
        server: keyConfig.server,
        records: records
      };

      // Convert to JSON and create download
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedZone}-backup-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const backupToSave = backupService.createBackup(selectedZone, records);
      backupService.downloadBackup(backupToSave);
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
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        // Validate backup format
        if (!data.version || !data.zone || !data.records) {
          throw new Error('Invalid backup file format');
        }
        setBackupData(data);
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Stored Backups
        </Typography>
        <List>
          {storedBackups.map((backup) => (
            <ListItem
              key={backup.id}
              button
              selected={selectedBackup?.id === backup.id}
              onClick={() => handleRestoreSelection(backup)}
            >
              <ListItemText
                primary={`${backup.zone} - ${new Date(backup.timestamp).toLocaleString()}`}
                secondary={`${backup.records.length} records - ${backup.type} backup`}
              />
              <ListItemSecondaryAction>
                <IconButton onClick={() => backupService.downloadBackup(backup)}>
                  <DownloadIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Box>

      {selectedBackup && (
        <Dialog
          open={true}
          onClose={() => setSelectedBackup(null)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Select Records to Restore
          </DialogTitle>
          <DialogContent>
            <List>
              {filteredRecords.map((record, index) => (
                <ListItem
                  key={index}
                  button
                  onClick={() => handleRecordSelection(record)}
                  selected={selectedRecords.some(r => 
                    r.name === record.name && 
                    r.type === record.type && 
                    r.value === record.value
                  )}
                >
                  <ListItemText
                    primary={`${record.name} ${record.type}`}
                    secondary={record.value}
                  />
                </ListItem>
              ))}
            </List>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedBackup(null)}>Cancel</Button>
            <Button
              onClick={() => setSelectedRecords(filteredRecords)}
              color="primary"
            >
              Select All
            </Button>
            <Button
              onClick={handleRestore}
              color="primary"
              variant="contained"
              disabled={!selectedRecords.length}
            >
              Restore Selected
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Paper>
  );
}

export default BackupImport; 