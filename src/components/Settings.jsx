import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Switch,
  FormHelperText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormGroup,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  Tooltip,
  Chip,
  Collapse,
  Badge
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  ExpandMore as ExpandMoreIcon,
  RestoreFromTrash as RestoreIcon,
  Compare as CompareIcon,
  KeyboardArrowUp as ExpandLessIcon,
  Add as AddedIcon,
  Remove as RemovedIcon,
  Edit as ModifiedIcon
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { notificationService } from '../services/notificationService';
import KeyManagement from './KeyManagement';
import { dnsService } from '../services/dnsService';
import { useKey } from '../context/KeyContext';
import { usePendingChanges } from '../context/PendingChangesContext';

function Settings() {
  const { selectedKey } = useKey();
  const { config, updateConfig } = useConfig();
  const { 
    addPendingChange, 
    setPendingChanges, 
    setShowPendingDrawer, 
    addPendingChanges
  } = usePendingChanges();
  const [defaultTTL, setDefaultTTL] = useState(config.defaultTTL || 3600);
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportKeys, setExportKeys] = useState(false);
  const [exportSettings, setExportSettings] = useState(true);
  const [exportBackups, setExportBackups] = useState(true);
  const [exportZonesOnly, setExportZonesOnly] = useState(true);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedData, setImportedData] = useState(null);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [importType, setImportType] = useState(null); // 'full' or 'zones'
  const [backups, setBackups] = useState(() => {
    const saved = localStorage.getItem('dnsBackups') || '[]';
    return JSON.parse(saved);
  });
  const [sortBy] = useState('date'); // Could make configurable later
  const [sortOrder] = useState('desc'); // Could make configurable later
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [expandedRecords, setExpandedRecords] = useState({});
  const [recordsToRestore, setRecordsToRestore] = useState([]);

  // Helper functions defined first
  const isSameDay = (date1, date2) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Remove the getRelativeTime function and replace with this utility
  const getRelativeTimeString = (timestamp) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const diff = timestamp - Date.now();
    const diffSeconds = Math.round(diff / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);

    // Choose appropriate time unit
    if (Math.abs(diffDays) >= 1) {
      return rtf.format(diffDays, 'day');
    }
    if (Math.abs(diffHours) >= 1) {
      return rtf.format(diffHours, 'hour');
    }
    if (Math.abs(diffMinutes) >= 1) {
      return rtf.format(diffMinutes, 'minute');
    }
    return rtf.format(diffSeconds, 'second');
  };

  // Update the groupedBackups useMemo to include relative time
  const groupedBackups = useMemo(() => {
    // Sort backups by date (newest first)
    const sortedBackups = [...backups].sort((a, b) => b.timestamp - a.timestamp);

    // Group by date
    return sortedBackups.reduce((groups, backup) => {
      const date = new Date(backup.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateKey;
      if (isSameDay(date, today)) {
        dateKey = 'Today';
      } else if (isSameDay(date, yesterday)) {
        dateKey = 'Yesterday';
      } else {
        dateKey = date.toLocaleDateString(undefined, { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }

      // Add relative time to the backup object
      groups[dateKey].push({
        ...backup,
        relativeTime: getRelativeTimeString(backup.timestamp)
      });
      return groups;
    }, {});
  }, [backups]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateConfig({
        ...config,
        defaultTTL,
        webhookUrl: webhookUrl.trim() || null
      });
      
      notificationService.setWebhookUrl(webhookUrl.trim() || null);
      setSuccess('Settings saved successfully');
    } catch (error) {
      setError(`Failed to save settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportConfig = () => {
    setExportDialogOpen(true);
  };

  const handleExportWithOptions = () => {
    try {
      const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
      const backups = JSON.parse(localStorage.getItem('dnsBackups') || '[]');
      
      const exportData = {};
      
      if (exportZonesOnly) {
        // Export just the zones list
        const zones = new Set();
        currentConfig.keys?.forEach(key => {
          key.zones?.forEach(zone => zones.add(zone));
        });
        
        exportData.dns_manager_config = {
          zones: Array.from(zones)
        };
      } else {
        // Export full or partial config based on selections
        exportData.dns_manager_config = { ...currentConfig };
        
        if (!exportKeys) {
          // Remove key data but keep zones
          exportData.dns_manager_config.keys = currentConfig.keys?.map(key => ({
            id: key.id,
            name: key.name,
            zones: key.zones
          }));
        }
        
        if (!exportSettings) {
          delete exportData.dns_manager_config.defaultTTL;
          delete exportData.dns_manager_config.webhookUrl;
        }
      }

      if (exportBackups) {
        exportData.dnsBackups = backups;
      }

      // Create filename based on content
      const filePrefix = exportZonesOnly ? 'dns-zones' : 'dns-config-backup';
      const filename = `${filePrefix}-${new Date().toISOString()}.json`;

      // Create and trigger download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportDialogOpen(false);
      setSuccess('Configuration exported successfully');
    } catch (error) {
      setError(`Failed to export configuration: ${error.message}`);
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Determine import type
        const isZonesOnly = data.dns_manager_config?.zones && 
          !data.dns_manager_config?.keys &&
          !data.dns_manager_config?.defaultTTL;

        setImportType(isZonesOnly ? 'zones' : 'full');
        setImportedData(data);
        setImportDialogOpen(true);
      } catch (error) {
        setError(`Failed to read import file: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    try {
      if (importType === 'zones') {
        // Handle zones-only import
        if (!selectedKeyId) {
          throw new Error('Please select a key to associate with the imported zones');
        }

        const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
        const keyToUpdate = currentConfig.keys.find(k => k.id === selectedKeyId);
        
        if (!keyToUpdate) {
          throw new Error('Selected key not found');
        }

        // Merge existing zones with imported zones
        const newZones = Array.from(new Set([
          ...(keyToUpdate.zones || []),
          ...(importedData.dns_manager_config.zones || [])
        ]));

        // Update the key's zones
        keyToUpdate.zones = newZones;

        // Update config
        await updateConfig(currentConfig);
        setSuccess('Zones imported successfully');
      } else {
        // Handle full backup import
        const currentConfig = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
        
        // Merge configurations
        const newConfig = {
          ...currentConfig,
          ...importedData.dns_manager_config,
        };

        // Update backups if included
        if (importedData.dnsBackups) {
          localStorage.setItem('dnsBackups', JSON.stringify(importedData.dnsBackups));
        }

        await updateConfig(newConfig);
        setSuccess('Configuration imported successfully');
      }

      setImportDialogOpen(false);
      setImportedData(null);
      setSelectedKeyId('');
    } catch (error) {
      setError(`Failed to import configuration: ${error.message}`);
    }
  };

  const handleDeleteBackup = async (backup) => {
    if (window.confirm('Are you sure you want to delete this backup?')) {
      try {
        const updatedBackups = backups.filter(b => b.id !== backup.id);
        localStorage.setItem('dnsBackups', JSON.stringify(updatedBackups));
        setBackups(updatedBackups);
        setSuccess('Backup deleted successfully');
      } catch (error) {
        setError('Failed to delete backup');
        console.error('Delete backup error:', error);
      }
    }
  };

  const handleRestoreBackup = (backup) => {
    setSelectedBackup(backup);
    setRestoreDialogOpen(true);
  };

  const handleCompareBackup = async (backup) => {
    setSelectedBackup(backup);
    setCompareDialogOpen(true);
    setLoadingComparison(true);
    
    try {
      // Find the key that manages this zone
      const keyForZone = config.keys.find(k => k.zones.includes(backup.zone));
      
      if (!keyForZone) {
        throw new Error('No key found for this zone');
      }

      // Use the new dnsService
      const currentRecords = await dnsService.fetchZoneRecords(
        backup.zone,
        {
          server: backup.server,
          keyName: keyForZone.name,
          keyValue: keyForZone.secret,
          algorithm: keyForZone.algorithm,
          id: keyForZone.id
        }
      );
      
      const comparison = compareZoneRecords(backup.records, currentRecords);
      setComparisonData(comparison);
    } catch (error) {
      console.error('Failed to load current zone records:', error);
      setError(`Failed to load current zone records: ${error.message}`);
    } finally {
      setLoadingComparison(false);
    }
  };

  const confirmRestore = async (recordsToRestore) => {
    try {
      const keyForZone = config.keys.find(k => k.zones.includes(selectedBackup.zone));
      
      if (!keyForZone) {
        throw new Error('No key found for this zone');
      }

      // Create pending changes for each selected record
      const changes = recordsToRestore.map(record => ({
        id: Date.now() + Math.random(),
        type: 'RESTORE',
        zone: selectedBackup.zone,
        keyId: keyForZone.id,
        record: {
          ...record,
          name: record.name,
          type: record.type,
          value: record.value,
          ttl: record.ttl || 3600,
          class: record.class || 'IN'
        },
        source: {
          type: 'backup',
          id: selectedBackup.id,
          timestamp: selectedBackup.timestamp
        }
      }));

      addPendingChanges(changes);
      setShowPendingDrawer(true);
      setRestoreDialogOpen(false);
      setRecordsToRestore([]);
      setSuccess(`${recordsToRestore.length} record(s) queued for restoration`);
    } catch (error) {
      setError('Failed to restore zone: ' + error.message);
    }
  };

  const compareZoneRecords = (backupRecords, currentRecords) => {
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Normalize record for comparison
    const normalizeRecord = (record) => {
      // Remove trailing dots from names and normalize case
      const name = record.name.replace(/\.+$/, '').toLowerCase();
      
      // Normalize value based on record type
      let value = record.value;
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = value.toString();
        if (record.type === 'TXT') {
          // Remove quotes and normalize whitespace for TXT records
          value = value.replace(/^"(.*)"$/, '$1').trim();
        } else if (record.type === 'MX' || record.type === 'SRV') {
          // Normalize spacing in priority-based records
          value = value.replace(/\s+/g, ' ').trim();
        } else if (record.type === 'CNAME' || record.type === 'NS' || record.type === 'PTR') {
          // Remove trailing dots from domain names
          value = value.replace(/\.+$/, '').toLowerCase();
        }
      }
      
      // Create a unique key for the record that includes all relevant fields
      return {
        key: `${name}|${record.type}|${value}|${record.ttl}|${record.class || 'IN'}`,
        normalizedRecord: {
          name,
          type: record.type,
          value,
          ttl: record.ttl,
          class: record.class || 'IN'
        },
        originalRecord: record
      };
    };

    // Create maps for both backup and current records
    const backupMap = new Map();
    const currentMap = new Map();

    // Process backup records
    backupRecords.forEach(record => {
      const normalized = normalizeRecord(record);
      backupMap.set(normalized.key, normalized);
    });

    // Process current records and do initial comparison
    currentRecords.forEach(record => {
      const normalized = normalizeRecord(record);
      currentMap.set(normalized.key, normalized);

      if (backupMap.has(normalized.key)) {
        // Record exists in both - it's unchanged
        unchanged.push(record);
        backupMap.delete(normalized.key);
      } else {
        // Record exists in current but not in backup - it's new
        added.push(record);
      }
    });

    // Any remaining records in backupMap were removed or modified
    backupMap.forEach(({ normalizedRecord: backup, originalRecord }) => {
      // Check if a record with same name and type exists (possible modification)
      const possibleModification = Array.from(currentMap.values()).find(
        ({ normalizedRecord: current }) => 
          current.name === backup.name && 
          current.type === backup.type
      );

      if (possibleModification) {
        // Record exists but with different value/ttl - it's modified
        modified.push({
          old: originalRecord,
          new: possibleModification.originalRecord,
          changes: findRecordChanges(originalRecord, possibleModification.originalRecord)
        });
      } else {
        // Record doesn't exist anymore - it was removed
        removed.push(originalRecord);
      }
    });

    return { 
      added, 
      removed, 
      modified, 
      unchanged: [] // Don't return unchanged records as they're not relevant for comparison
    };
  };

  const findRecordChanges = (oldRecord, newRecord) => {
    const changes = [];
    
    // Normalize values for comparison
    const normalizeValue = (record) => {
      let value = record.value.toString();
      if (record.type === 'TXT') {
        return value.replace(/^"(.*)"$/, '$1').trim();
      }
      if (record.type === 'MX' || record.type === 'SRV') {
        return value.replace(/\s+/g, ' ').trim();
      }
      if (record.type === 'CNAME' || record.type === 'NS' || record.type === 'PTR') {
        return value.replace(/\.+$/, '').toLowerCase();
      }
      return value;
    };

    const oldValue = normalizeValue(oldRecord);
    const newValue = normalizeValue(newRecord);
    
    if (oldValue !== newValue) {
      changes.push('value');
    }
    if (oldRecord.ttl !== newRecord.ttl) {
      changes.push('ttl');
    }
    if ((oldRecord.class || 'IN') !== (newRecord.class || 'IN')) {
      changes.push('class');
    }

    return changes;
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Application Settings
        </Typography>

        <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <FormControl>
            <InputLabel>Default TTL</InputLabel>
            <Select
              value={defaultTTL}
              onChange={(e) => setDefaultTTL(e.target.value)}
              label="Default TTL"
            >
              <MenuItem value={300}>5 minutes</MenuItem>
              <MenuItem value={3600}>1 hour</MenuItem>
              <MenuItem value={86400}>24 hours</MenuItem>
            </Select>
            <FormHelperText>Default Time-To-Live for new records</FormHelperText>
          </FormControl>

          <TextField
            label="Mattermost Webhook URL"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            helperText="Receive notifications when DNS changes are applied"
            fullWidth
          />

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            Save Settings
          </Button>
        </Box>
      </Paper>

      <KeyManagement />
    </Box>
  );
}

export default Settings;