import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  FormHelperText,
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
  Badge,
  Grid,
  InputAdornment
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  ExpandMore as ExpandMoreIcon,
  RestoreFromTrash as RestoreIcon,
  Compare as CompareIcon,
  KeyboardArrowUp as ExpandLessIcon,
  Add as AddedIcon,
  Remove as RemovedIcon,
  Edit as ModifiedIcon,
  Search as SearchIcon,
  Backup as BackupIcon,
  AutoMode as AutoModeIcon
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { backupService } from '../services/backupService.ts';
import { notificationService } from '../services/notificationService';
import { useKey } from '../context/KeyContext';
import { usePendingChanges } from '../context/PendingChangesContext';
import { tsigKeyService } from '../services/tsigKeyService';

// Add this utility function near the top of the file
const getRelativeTimeString = (timestamp) => {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const now = Date.now();
  const diff = timestamp - now;
  
  // Convert to appropriate time unit
  const diffSeconds = Math.round(diff / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  const diffWeeks = Math.round(diffDays / 7);
  const diffMonths = Math.round(diffDays / 30);
  const diffYears = Math.round(diffDays / 365);

  // Choose appropriate time unit based on difference
  if (Math.abs(diffYears) >= 1) {
    return rtf.format(diffYears, 'year');
  }
  if (Math.abs(diffMonths) >= 1) {
    return rtf.format(diffMonths, 'month');
  }
  if (Math.abs(diffWeeks) >= 1) {
    return rtf.format(diffWeeks, 'week');
  }
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

// Add this helper function at the top level
const normalizeRecord = (record) => {
  const name = record.name.replace(/\.+$/, '').toLowerCase();
  let value = record.value;

  // Skip TSIG records
  if (record.type === 'TSIG') {
    return null;
  }

  // Handle different record types
  switch (record.type) {
    case 'SOA': {
      // For SOA records, parse and normalize each component
      let soaValue;
      if (typeof value === 'object') {
        soaValue = value;
      } else {
        // Parse space-separated SOA string
        const [mname, rname, serial, refresh, retry, expire, minimum] = value.split(/\s+/);
        soaValue = {
          mname,
          rname,
          refresh: parseInt(refresh) || 0,
          retry: parseInt(retry) || 0,
          expire: parseInt(expire) || 0,
          minimum: parseInt(minimum) || 0
        };
      }

      // Normalize the values consistently, excluding serial number for comparison
      value = {
        mname: soaValue.mname?.toLowerCase().replace(/\.+$/, ''),
        rname: soaValue.rname?.toLowerCase().replace(/\.+$/, ''),
        // Exclude serial from the comparison value
        refresh: parseInt(soaValue.refresh) || 0,
        retry: parseInt(soaValue.retry) || 0,
        expire: parseInt(soaValue.expire) || 0,
        minimum: parseInt(soaValue.minimum) || 0
      };

      // Create comparison key without serial number
      return {
        key: `${name}|${record.type}|${JSON.stringify(value)}|${record.ttl}|${record.class || 'IN'}`,
        normalizedRecord: {
          name,
          type: record.type,
          value,
          ttl: record.ttl,
          class: record.class || 'IN'
        },
        originalRecord: record
      };
    }
    case 'MX': {
      // For MX records, normalize priority and domain
      const [priority, domain] = typeof value === 'string' ? value.split(/\s+/) : [value.priority, value.exchange];
      value = `${parseInt(priority)} ${domain.toLowerCase().replace(/\.+$/, '')}`;
      break;
    }
    case 'SRV': {
      // For SRV records, normalize all components
      if (typeof value === 'string') {
        const [priority, weight, port, target] = value.split(/\s+/);
        value = `${parseInt(priority)} ${parseInt(weight)} ${parseInt(port)} ${target.toLowerCase().replace(/\.+$/, '')}`;
      } else {
        value = `${parseInt(value.priority)} ${parseInt(value.weight)} ${parseInt(value.port)} ${value.target.toLowerCase().replace(/\.+$/, '')}`;
      }
      break;
    }
    case 'TXT':
      // Normalize TXT records by removing quotes and normalizing whitespace
      value = String(value).replace(/^"(.*)"$/, '$1').replace(/\s+/g, ' ').trim();
      break;
    case 'CNAME':
    case 'NS':
    case 'PTR':
      // Normalize domain names
      value = String(value).toLowerCase().replace(/\.+$/, '');
      break;
    default:
      // For other record types, just convert to string
      value = String(value).trim();
  }

  return {
    key: `${name}|${record.type}|${JSON.stringify(value)}|${record.ttl}|${record.class || 'IN'}`,
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

const normalizeValue = (record) => {
  let value = record.value;
  
  // Handle object values (like for CAA records)
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  value = value.toString();

  switch (record.type.toUpperCase()) {
    case 'TXT':
      // Remove enclosing quotes and normalize whitespace
      return value.replace(/^["'](.*)["']$/, '$1')
                 .replace(/\s+/g, ' ')
                 .trim();
    
    case 'MX':
    case 'SRV':
      // Normalize priority-based records
      return value.replace(/\s+/g, ' ').trim();
    
    case 'CNAME':
    case 'NS':
    case 'PTR':
    case 'DNAME':
      // Normalize domain names
      return value.toLowerCase().replace(/\.+$/, '');
    
    case 'A':
    case 'AAAA':
      // Normalize IP addresses
      return value.trim();
    
    case 'CAA':
      // Handle CAA record format
      try {
        const [flags, tag, value] = value.split(/\s+/);
        return `${parseInt(flags)} ${tag.toLowerCase()} ${value.replace(/^["'](.*)["']$/, '$1')}`;
      } catch {
        return value;
      }
    
    default:
      return value;
  }
};

const normalizeSOA = (record) => {
  if (!record || record.type !== 'SOA') return null;

  let soaValue;
  if (typeof record.value === 'object') {
    soaValue = record.value;
  } else {
    const [mname, rname, serial, refresh, retry, expire, minimum] = record.value.split(/\s+/);
    soaValue = {
      mname,
      rname,
      refresh: parseInt(refresh) || 0,
      retry: parseInt(retry) || 0,
      expire: parseInt(expire) || 0,
      minimum: parseInt(minimum) || 0
    };
  }

  // Return normalized SOA without serial
  return {
    mname: soaValue.mname?.toLowerCase().replace(/\.+$/, ''),
    rname: soaValue.rname?.toLowerCase().replace(/\.+$/, ''),
    refresh: parseInt(soaValue.refresh) || 0,
    retry: parseInt(soaValue.retry) || 0,
    expire: parseInt(soaValue.expire) || 0,
    minimum: parseInt(soaValue.minimum) || 0
  };
};

const compareSOA = (record1, record2) => {
  const soa1 = normalizeSOA(record1);
  const soa2 = normalizeSOA(record2);
  
  if (!soa1 || !soa2) return false;
  
  return JSON.stringify(soa1) === JSON.stringify(soa2);
};

function Snapshots() {
  const { addPendingChange, setShowPendingDrawer } = usePendingChanges();
  // Move all state from BackupImport
  const { config } = useConfig();
  const { selectedKey } = useKey();
  const [selectedZone, setSelectedZone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [expandedRecords, setExpandedRecords] = useState({});
  const [recordsToRestore, setRecordsToRestore] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterZone, setFilterZone] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [backendKeys, setBackendKeys] = useState([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Load keys from backend API
  useEffect(() => {
    const loadKeys = async () => {
      try {
        const keys = await tsigKeyService.listKeys();
        setBackendKeys(keys);
      } catch (error) {
        console.error('Failed to load keys:', error);
        // Fall back to config keys if backend fails
        setBackendKeys(config.keys || []);
      }
    };

    loadKeys();
  }, [config.keys]);

  // Get available zones from backend keys
  const availableZones = useMemo(() => {
    const zones = new Set();
    backendKeys.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [backendKeys]);

  const availableKeys = useMemo(() => {
    if (!selectedZone) return [];
    return backendKeys.filter(key => key.zones?.includes(selectedZone)) || [];
  }, [backendKeys, selectedZone]);

  // Load backups from backend API on mount
  useEffect(() => {
    const loadBackups = async () => {
      setLoadingBackups(true);
      try {
        const backupList = await backupService.getBackups();
        setBackups(backupList);
      } catch (error) {
        console.error('Failed to load backups:', error);
        setError(`Failed to load snapshots: ${error.message}`);
      } finally {
        setLoadingBackups(false);
      }
    };

    loadBackups();
  }, []);

  // Move all the helper functions and handlers from BackupImport
  const handleBackup = async () => {
    if (!selectedZone || !selectedKeyId) {
      setError('Please select both a zone and a key');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const keyConfig = backendKeys.find(key => key.id === selectedKeyId);
      if (!keyConfig) {
        throw new Error('No key configuration found');
      }

      // Fetch zone records - backend will look up key server-side
      const records = await dnsService.fetchZoneRecords(selectedZone);

      const backup = await backupService.createBackup(selectedZone, records, {
        type: 'manual',
        description: 'Manual snapshot',
        server: keyConfig.server,
        config: config
      });

      // Reload all backups from server
      const backupList = await backupService.getBackups();
      setBackups(backupList);
      setSuccess('Snapshot created successfully');
    } catch (err) {
      console.error('Backup failed:', err);
      setError(`Failed to create snapshot: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSnapshot = async () => {
    if (!importFile) {
      setError('Please select a file to import');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const fileContent = await importFile.text();
      const snapshotData = JSON.parse(fileContent);

      // Validate snapshot format
      if (!snapshotData.zone || !snapshotData.records || !Array.isArray(snapshotData.records)) {
        throw new Error('Invalid snapshot format. Must contain zone and records array.');
      }

      // Import the snapshot
      await backupService.importBackup(snapshotData);

      // Reload backups
      const backupList = await backupService.getBackups();
      setBackups(backupList);

      setSuccess(`Snapshot imported successfully for zone ${snapshotData.zone}`);
      setImportDialogOpen(false);
      setImportFile(null);
    } catch (err) {
      console.error('Import failed:', err);
      setError(`Failed to import snapshot: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteBackup = async (backup) => {
    if (window.confirm('Are you sure you want to delete this snapshot?')) {
      try {
        await backupService.deleteBackup(backup.zone, backup.id);
        // Reload backups after deletion
        const backupList = await backupService.getBackups();
        setBackups(backupList);
        setSuccess('Snapshot deleted successfully');
      } catch (error) {
        setError(`Failed to delete snapshot: ${error.message}`);
        console.error('Delete backup error:', error);
      }
    }
  };

  const handleDownloadBackup = async (backupListItem) => {
    try {
      // Load full backup with records from backend
      const fullBackup = await backupService.getBackup(backupListItem.zone, backupListItem.id);

      const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
        type: 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapshot-${fullBackup.zone}-${new Date(fullBackup.timestamp).toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      setError(`Failed to download snapshot: ${error.message}`);
    }
  };

  // Group backups by date
  const groupedBackups = useMemo(() => {
    const filtered = backups
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
    return sorted.reduce((groups, backup) => {
      const date = new Date(backup.timestamp).toLocaleDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(backup);
      return groups;
    }, {});
  }, [backups, searchTerm, filterZone, sortBy, sortOrder]);

  // Get unique zones from backups
  const availableZonesInBackups = useMemo(() => {
    const zones = new Set(backups.map(backup => backup.zone));
    return ['all', ...Array.from(zones)];
  }, [backups]);

  // Add these functions after the existing handlers:

  const handleRestoreBackup = async (backupListItem) => {
    try {
      // Load full backup with records from backend
      const fullBackup = await backupService.getBackup(backupListItem.zone, backupListItem.id);
      setSelectedBackup(fullBackup);
      setRestoreDialogOpen(true);
    } catch (error) {
      console.error('Failed to load backup:', error);
      setError(`Failed to load snapshot: ${error.message}`);
    }
  };

  const handleCompareBackup = async (backupListItem) => {
    setCompareDialogOpen(true);
    setLoadingComparison(true);

    try {
      // Load full backup with records from backend
      const fullBackup = await backupService.getBackup(backupListItem.zone, backupListItem.id);
      setSelectedBackup(fullBackup);

      console.log('Fetching current records for zone:', backupListItem.zone);

      // Fetch current zone records - backend will look up key server-side
      const currentRecords = await dnsService.fetchZoneRecords(backupListItem.zone);

      console.log('Fetched current records:', currentRecords);

      if (!Array.isArray(currentRecords) || currentRecords.length === 0) {
        throw new Error('Failed to fetch current zone records or zone is empty');
      }

      // Compare records
      const comparison = compareZoneRecords(fullBackup.records, currentRecords);
      setComparisonData(comparison);
    } catch (error) {
      console.error('Failed to load current zone records:', error);
      setError(`Failed to load current zone records: ${error.message}`);
    } finally {
      setLoadingComparison(false);
    }
  };

  // Replace the existing compareZoneRecords function with this corrected version
  const findRecordChanges = (oldRecord, newRecord) => {
    const changes = [];
    
    // Normalize values for comparison
    const normalizeValue = (record) => {
      if (record.type === 'TSIG') {
        // Skip TSIG record comparison
        return '';
      }

      if (record.type === 'SOA') {
        // For SOA records, parse and normalize
        let soaValue;
        if (typeof record.value === 'object') {
          soaValue = record.value;
        } else {
          const [mname, rname, serial, refresh, retry, expire, minimum] = record.value.split(/\s+/);
          soaValue = {
            mname,
            rname,
            refresh: parseInt(refresh) || 0,
            retry: parseInt(retry) || 0,
            expire: parseInt(expire) || 0,
            minimum: parseInt(minimum) || 0
          };
        }

        // Return normalized SOA value without serial
        return JSON.stringify({
          mname: soaValue.mname?.toLowerCase().replace(/\.+$/, ''),
          rname: soaValue.rname?.toLowerCase().replace(/\.+$/, ''),
          refresh: parseInt(soaValue.refresh) || 0,
          retry: parseInt(soaValue.retry) || 0,
          expire: parseInt(soaValue.expire) || 0,
          minimum: parseInt(soaValue.minimum) || 0
        });
      }

      if (typeof record.value === 'object') {
        return JSON.stringify(record.value);
      }
      
      const value = String(record.value);
      
      switch (record.type) {
        case 'TXT':
          return value.replace(/^"(.*)"$/, '$1').trim();
        case 'MX':
        case 'SRV':
          return value.replace(/\s+/g, ' ').trim();
        case 'CNAME':
        case 'NS':
        case 'PTR':
          return value.replace(/\.+$/, '').toLowerCase();
        default:
          return value;
      }
    };

    const oldValue = normalizeValue(oldRecord);
    const newValue = normalizeValue(newRecord);
    
    if (oldValue !== newValue) {
      changes.push({
        field: 'value',
        old: oldRecord.value,
        new: newRecord.value
      });
    }
    if (oldRecord.ttl !== newRecord.ttl) {
      changes.push({
        field: 'ttl',
        old: oldRecord.ttl,
        new: newRecord.ttl
      });
    }
    if ((oldRecord.class || 'IN') !== (newRecord.class || 'IN')) {
      changes.push({
        field: 'class',
        old: oldRecord.class || 'IN',
        new: newRecord.class || 'IN'
      });
    }

    return changes;
  };

  const compareZoneRecords = (backupRecords, currentRecords) => {
    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Filter out TSIG records and normalize all records
    const backupMap = new Map();
    const currentMap = new Map();

    // Process backup records
    backupRecords
      .map(record => normalizeRecord(record))
      .filter(Boolean)
      .forEach(normalized => {
        backupMap.set(normalized.key, normalized);
      });

    // Process current records
    currentRecords
      .map(record => normalizeRecord(record))
      .filter(Boolean)
      .forEach(normalized => {
        currentMap.set(normalized.key, normalized);

        if (backupMap.has(normalized.key)) {
          // Record exists in both - it's unchanged
          unchanged.push(normalized.originalRecord);
          backupMap.delete(normalized.key);
        } else {
          // Check if a record with same name and type exists (possible modification)
          const possibleMatch = Array.from(backupMap.values()).find(
            backup => backup.normalizedRecord.name === normalized.normalizedRecord.name &&
                      backup.normalizedRecord.type === normalized.normalizedRecord.type
          );

          if (!possibleMatch) {
            // No matching record found - it's new
            added.push(normalized.originalRecord);
          }
          // If there's a possible match, wait to process it in the backupMap loop
        }
      });

    // Process remaining backup records
    backupMap.forEach(backup => {
      // Look for modifications
      const possibleMatch = Array.from(currentMap.values()).find(
        current => current.normalizedRecord.name === backup.normalizedRecord.name &&
                   current.normalizedRecord.type === backup.normalizedRecord.type
      );

      if (possibleMatch) {
        // Record exists but with different value/ttl - it's modified
        const changes = findRecordChanges(backup.originalRecord, possibleMatch.originalRecord);
        if (changes.length > 0) {
          modified.push({
            old: backup.originalRecord,
            new: possibleMatch.originalRecord,
            changes
          });
        }
      } else {
        // Record doesn't exist anymore - it was removed
        removed.push(backup.originalRecord);
      }
    });

    return { added, removed, modified, unchanged: [] };
  };

  const isRecordEqual = (record1, record2) => {
    // Must be same type and name
    if (record1.name !== record2.name || record1.type !== record2.type) {
      return false;
    }

    // Special handling for different record types
    switch (record1.type) {
      case 'SOA':
        return compareSOA(record1, record2);
      case 'MX':
        // Compare priority and exchange separately
        const [prio1, exchange1] = record1.value.split(/\s+/);
        const [prio2, exchange2] = record2.value.split(/\s+/);
        return parseInt(prio1) === parseInt(prio2) && 
               exchange1.toLowerCase().replace(/\.+$/, '') === exchange2.toLowerCase().replace(/\.+$/, '');
      case 'SRV':
        // Compare all SRV components
        const [p1, w1, port1, target1] = record1.value.split(/\s+/);
        const [p2, w2, port2, target2] = record2.value.split(/\s+/);
        return parseInt(p1) === parseInt(p2) &&
               parseInt(w1) === parseInt(w2) &&
               parseInt(port1) === parseInt(port2) &&
               target1.toLowerCase().replace(/\.+$/, '') === target2.toLowerCase().replace(/\.+$/, '');
      default:
        // For other records, normalize and compare
        return record1.value.toString().toLowerCase().replace(/\.+$/, '') === 
               record2.value.toString().toLowerCase().replace(/\.+$/, '') &&
               record1.ttl === record2.ttl &&
               (record1.class || 'IN') === (record2.class || 'IN');
    }
  };

  const confirmRestore = async (recordsToRestore) => {
    try {
      // Find the key that manages this zone
      const keyForZone = backendKeys.find(k => k.zones.includes(selectedBackup.zone));

      if (!keyForZone) {
        throw new Error('No key found for this zone');
      }

      // Fetch current zone records to check what exists
      const currentRecords = await dnsService.fetchZoneRecords(selectedBackup.zone);

      const changes = [];

      console.log('=== RESTORE DEBUG ===');
      console.log('Records to restore:', recordsToRestore.length);
      console.log('Current zone records:', currentRecords.length);

      // Filter out TSIG records from both snapshot and current records
      const filteredRecordsToRestore = recordsToRestore.filter(r => r.type !== 'TSIG');
      const filteredCurrentRecords = currentRecords.filter(r => r.type !== 'TSIG');

      console.log('After filtering TSIG - Snapshot:', filteredRecordsToRestore.length, 'Current:', filteredCurrentRecords.length);

      // Process records from snapshot (ADD or MODIFY)
      filteredRecordsToRestore.forEach(record => {
        const normalizedRecord = {
          ...record,
          name: record.name,
          type: record.type,
          value: record.value,
          ttl: record.ttl || 3600,
          class: record.class || 'IN'
        };

        // Find EXACT match by name, type, AND value (not just name/type)
        const exactMatch = filteredCurrentRecords.find(r =>
          r.name === normalizedRecord.name &&
          r.type === normalizedRecord.type &&
          isRecordEqual(r, normalizedRecord)
        );

        if (exactMatch) {
          // Exact match found - skip it (no change needed)
          if (record.type !== 'SOA') {
            console.log(`Skipping ${normalizedRecord.name} (${normalizedRecord.type}) - exact match`);
          }
        } else {
          // No exact match - check if there's a record with same name/type but different value
          const partialMatch = filteredCurrentRecords.find(r =>
            r.name === normalizedRecord.name &&
            r.type === normalizedRecord.type
          );

          if (partialMatch) {
            // Record exists with same name/type but different value - use MODIFY
            if (record.type !== 'SOA') {
              console.log(`MODIFY ${normalizedRecord.name} (${normalizedRecord.type}):`, {
                from: partialMatch.value,
                to: normalizedRecord.value
              });
            }

            changes.push({
              id: Date.now() + Math.random(),
              type: 'MODIFY',
              zone: selectedBackup.zone,
              keyId: keyForZone.id,
              originalRecord: partialMatch,
              newRecord: normalizedRecord,
              source: {
                type: 'backup',
                id: selectedBackup.id,
                timestamp: selectedBackup.timestamp
              }
            });
          } else {
            // Record doesn't exist at all - use ADD
            console.log(`ADD ${normalizedRecord.name} (${normalizedRecord.type})`);

            changes.push({
              id: Date.now() + Math.random(),
              type: 'ADD',
              zone: selectedBackup.zone,
              keyId: keyForZone.id,
              record: normalizedRecord,
              source: {
                type: 'backup',
                id: selectedBackup.id,
                timestamp: selectedBackup.timestamp
              }
            });
          }
        }
      });

      // Process records in current zone that are NOT in snapshot (DELETE)
      filteredCurrentRecords.forEach(currentRecord => {
        // Skip SOA records - never delete these
        if (currentRecord.type === 'SOA') return;

        // Check if this EXACT current record (name+type+value) exists in the snapshot
        const inSnapshot = filteredRecordsToRestore.find(r =>
          r.name === currentRecord.name &&
          r.type === currentRecord.type &&
          isRecordEqual(currentRecord, r)
        );

        if (!inSnapshot) {
          // This exact record exists now but wasn't in the snapshot - mark for deletion
          console.log(`DELETE ${currentRecord.name} (${currentRecord.type}) - value: ${currentRecord.value}`);

          changes.push({
            id: Date.now() + Math.random(),
            type: 'DELETE',
            zone: selectedBackup.zone,
            keyId: keyForZone.id,
            record: currentRecord,
            source: {
              type: 'backup',
              id: selectedBackup.id,
              timestamp: selectedBackup.timestamp
            }
          });
        }
      });

      if (changes.length === 0) {
        setSuccess('No changes needed - all selected records are already up to date');
        setRestoreDialogOpen(false);
        setRecordsToRestore([]);
        return;
      }

      // Add each change individually using addPendingChange
      changes.forEach(change => {
        console.log('Adding pending change:', change); // Debug log
        addPendingChange(change);
      });

      // Count change types for informative message
      const adds = changes.filter(c => c.type === 'ADD').length;
      const modifies = changes.filter(c => c.type === 'MODIFY').length;
      const deletes = changes.filter(c => c.type === 'DELETE').length;

      const parts = [];
      if (adds > 0) parts.push(`${adds} add${adds !== 1 ? 's' : ''}`);
      if (modifies > 0) parts.push(`${modifies} modification${modifies !== 1 ? 's' : ''}`);
      if (deletes > 0) parts.push(`${deletes} deletion${deletes !== 1 ? 's' : ''}`);

      setShowPendingDrawer(true);
      setRestoreDialogOpen(false);
      setRecordsToRestore([]);
      setSuccess(`Restore queued: ${parts.join(', ')}`);
    } catch (error) {
      console.error('Failed to restore records:', error);
      setError('Failed to restore zone: ' + error.message);
    }
  };

  // Update the comparison display in the dialog
  const renderComparisonDetails = (record) => {
    return record.changes.map((change, index) => (
      <TableRow key={`${record.old.name}-${record.old.type}-${change.field}-${index}`}>
        <TableCell component="th" scope="row">
          {change.field}
        </TableCell>
        <TableCell>
          <Typography 
            component="pre" 
            sx={{ 
              m: 0, 
              p: 1, 
              backgroundColor: 'error.light',
              borderRadius: 1,
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {typeof change.old === 'object' ? JSON.stringify(change.old, null, 2) : change.old}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography 
            component="pre" 
            sx={{ 
              m: 0, 
              p: 1, 
              backgroundColor: 'success.light',
              borderRadius: 1,
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {typeof change.new === 'object' ? JSON.stringify(change.new, null, 2) : change.new}
          </Typography>
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Create New Snapshot
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

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>DNS Key</InputLabel>
            <Select
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              label="DNS Key"
              disabled={!selectedZone}
            >
              {availableKeys.map((key) => (
                <MenuItem key={key.id} value={key.id}>
                  {key.name || key.id}
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
              Create Snapshot
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setImportDialogOpen(true)}
            >
              Import Snapshot
            </Button>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Snapshots
        </Typography>

        {/* Search and Filter Controls */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search snapshots..."
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
        {loadingBackups ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : Object.entries(groupedBackups).length > 0 ? (
          Object.entries(groupedBackups).map(([date, backups]) => (
            <Accordion key={date} defaultExpanded={date === Object.keys(groupedBackups)[0]}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography>{date}</Typography>
                  <Chip 
                    size="small" 
                    label={`${backups.length} snapshot${backups.length !== 1 ? 's' : ''}`}
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
                              <Tooltip title={backup.type === 'auto' ? 'Automatic snapshot' : 'Manual snapshot'}>
                                {backup.type === 'auto' ? 
                                  <AutoModeIcon fontSize="small" color="action" /> : 
                                  <BackupIcon fontSize="small" color="action" />
                                }
                              </Tooltip>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {new Date(backup.timestamp).toLocaleTimeString()}
                              </Typography>
                              <Tooltip title={new Date(backup.timestamp).toLocaleString()}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                  ({getRelativeTimeString(backup.timestamp)})
                                </Typography>
                              </Tooltip>
                            </Box>
                            <Typography variant="body2">
                              Records: {backup.recordCount}
                            </Typography>
                            {backup.description && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {backup.description}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Download snapshot">
                              <IconButton
                                size="small"
                                onClick={() => handleDownloadBackup(backup)}
                              >
                                <DownloadIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Compare with current zone">
                              <IconButton
                                size="small"
                                onClick={() => handleCompareBackup(backup)}
                              >
                                <CompareIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Restore this snapshot">
                              <IconButton
                                size="small"
                                onClick={() => handleRestoreBackup(backup)}
                              >
                                <RestoreIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete snapshot">
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
          ))
        ) : (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No snapshots available
          </Typography>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Restore Dialog */}
      <Dialog
        open={restoreDialogOpen}
        onClose={() => setRestoreDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Restore Snapshot</DialogTitle>
        <DialogContent>
          {selectedBackup && (
            <>
              <DialogContentText>
                Select records to restore from snapshot taken on{' '}
                {new Date(selectedBackup.timestamp).toLocaleString()}
                {' '}for zone <strong>{selectedBackup?.zone}</strong>
              </DialogContentText>
              
              <TableContainer sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={recordsToRestore.length === selectedBackup?.records?.filter(r => r.type !== 'TSIG').length}
                          indeterminate={
                            recordsToRestore.length > 0 &&
                            recordsToRestore.length < selectedBackup?.records?.filter(r => r.type !== 'TSIG').length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRecordsToRestore(selectedBackup?.records?.filter(r => r.type !== 'TSIG') || []);
                            } else {
                              setRecordsToRestore([]);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Value</TableCell>
                      <TableCell>TTL</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedBackup?.records?.filter(r => r.type !== 'TSIG').map((record, index) => (
                      <TableRow
                        key={index}
                        hover
                        selected={recordsToRestore.includes(record)}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={recordsToRestore.includes(record)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRecordsToRestore(prev => [...prev, record]);
                              } else {
                                setRecordsToRestore(prev => 
                                  prev.filter(r => r !== record)
                                );
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>{record.name}</TableCell>
                        <TableCell>{record.type}</TableCell>
                        <TableCell>
                          {typeof record.value === 'object' ? 
                            JSON.stringify(record.value) : 
                            record.value
                          }
                        </TableCell>
                        <TableCell>{record.ttl}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => confirmRestore(recordsToRestore)} 
            color="warning" 
            variant="contained"
            disabled={recordsToRestore.length === 0}
          >
            Restore {recordsToRestore.length} Record{recordsToRestore.length !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog
        open={compareDialogOpen}
        onClose={() => {
          setCompareDialogOpen(false);
          setComparisonData(null);
          setExpandedRecords({});
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Compare Zone Changes - {selectedBackup?.zone}
        </DialogTitle>
        <DialogContent>
          {loadingComparison ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : comparisonData ? (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Changes since {new Date(selectedBackup?.timestamp).toLocaleString()}
                {' '}
                <Typography component="span" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  ({getRelativeTimeString(selectedBackup?.timestamp)})
                </Typography>
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Badge badgeContent={comparisonData.added.length} color="success">
                  <Chip label="New Records" icon={<AddedIcon />} />
                </Badge>
                <Badge badgeContent={comparisonData.modified.length} color="warning">
                  <Chip label="Modified Records" icon={<ModifiedIcon />} />
                </Badge>
                <Badge badgeContent={comparisonData.removed.length} color="error">
                  <Chip label="Removed Records" icon={<RemovedIcon />} />
                </Badge>
              </Box>

              {comparisonData.modified.length > 0 && (
                <>
                  <Typography variant="h6" color="warning.main" gutterBottom>
                    Modified Records
                  </Typography>
                  <TableContainer component={Paper} sx={{ mb: 3 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell />
                          <TableCell>Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Changes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {comparisonData.modified.map((record, index) => (
                          <React.Fragment key={index}>
                            <TableRow>
                              <TableCell>
                                <IconButton
                                  size="small"
                                  onClick={() => setExpandedRecords(prev => ({
                                    ...prev,
                                    [`modified-${index}`]: !prev[`modified-${index}`]
                                  }))}
                                >
                                  {expandedRecords[`modified-${index}`] ? 
                                    <ExpandLessIcon /> : <ExpandMoreIcon />}
                                </IconButton>
                              </TableCell>
                              <TableCell>{record.old.name}</TableCell>
                              <TableCell>{record.old.type}</TableCell>
                              <TableCell>
                                {record.changes.map(c => c.field).join(', ')}
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
                                <Collapse in={expandedRecords[`modified-${index}`]}>
                                  <Box sx={{ margin: 1 }}>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Field</TableCell>
                                          <TableCell>Snapshot Value</TableCell>
                                          <TableCell>Current Value</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {renderComparisonDetails(record)}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {comparisonData.added.length > 0 && (
                <>
                  <Typography variant="h6" color="success.main" gutterBottom>
                    New Records
                  </Typography>
                  <TableContainer component={Paper} sx={{ mb: 3 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell>TTL</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {comparisonData.added.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell>{record.name}</TableCell>
                            <TableCell>
                              <Chip 
                                label={record.type} 
                                size="small" 
                                color="success"
                                component="span"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography 
                                component="pre" 
                                sx={{ 
                                  m: 0, 
                                  p: 1, 
                                  backgroundColor: 'success.light',
                                  borderRadius: 1,
                                  fontSize: '0.875rem',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all'
                                }}
                              >
                                {typeof record.value === 'object' ? 
                                  JSON.stringify(record.value, null, 2) : 
                                  record.value
                                }
                              </Typography>
                            </TableCell>
                            <TableCell>{record.ttl}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {comparisonData.removed.length > 0 && (
                <>
                  <Typography variant="h6" color="error.main" gutterBottom>
                    Removed Records
                  </Typography>
                  <TableContainer component={Paper} sx={{ mb: 3 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell>TTL</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {comparisonData.removed.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell>{record.name}</TableCell>
                            <TableCell>
                              <Chip 
                                label={record.type} 
                                size="small" 
                                color="error"
                                component="span"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography 
                                component="pre" 
                                sx={{ 
                                  m: 0, 
                                  p: 1, 
                                  backgroundColor: 'error.light',
                                  borderRadius: 1,
                                  fontSize: '0.875rem',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all'
                                }}
                              >
                                {typeof record.value === 'object' ? 
                                  JSON.stringify(record.value, null, 2) : 
                                  record.value
                                }
                              </Typography>
                            </TableCell>
                            <TableCell>{record.ttl}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {comparisonData.added.length === 0 && 
               comparisonData.modified.length === 0 && 
               comparisonData.removed.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No changes detected between the snapshot and current zone.
                </Alert>
              )}
            </Box>
          ) : (
            <Typography>Failed to load comparison data</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompareDialogOpen(false)}>Close</Button>
          <Button
            onClick={() => {
              // Close compare dialog and open restore dialog
              setCompareDialogOpen(false);
              handleRestoreBackup(selectedBackup);
            }}
            color="primary"
            variant="outlined"
          >
            Select Records to Restore
          </Button>
          <Button
            onClick={async () => {
              // Restore ALL records from snapshot (full restore)
              setCompareDialogOpen(false);
              setRecordsToRestore(selectedBackup.records);
              await confirmRestore(selectedBackup.records);
            }}
            color="warning"
            variant="contained"
            disabled={!comparisonData || (
              comparisonData.added.length === 0 &&
              comparisonData.modified.length === 0 &&
              comparisonData.removed.length === 0
            )}
          >
            Restore All Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Snapshot Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => {
          setImportDialogOpen(false);
          setImportFile(null);
          setError(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Import Snapshot</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Select a snapshot JSON file to import. The snapshot will be added to the list and can be restored later.
          </DialogContentText>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Button
            variant="outlined"
            component="label"
            fullWidth
            startIcon={<UploadIcon />}
            sx={{ mb: 2 }}
          >
            {importFile ? importFile.name : 'Choose File'}
            <input
              type="file"
              hidden
              accept=".json"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setImportFile(e.target.files[0]);
                  setError(null);
                }
              }}
            />
          </Button>

          {importFile && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Ready to import: {importFile.name} ({(importFile.size / 1024).toFixed(2)} KB)
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportDialogOpen(false);
              setImportFile(null);
              setError(null);
            }}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImportSnapshot}
            variant="contained"
            disabled={!importFile || importing}
            startIcon={importing ? <CircularProgress size={20} /> : <UploadIcon />}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Snapshots; 