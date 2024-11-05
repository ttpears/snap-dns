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
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';

function ZoneViewer() {
  const { config } = useConfig();
  const [selectedZone, setSelectedZone] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Add the record types constant
  const recordTypes = ['ALL', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR', 'SRV', 'CAA'];

  // Get all available zones from the user's configuration
  const availableZones = useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  const getKeyForZone = useCallback((zoneName) => {
    console.log('Looking for key for zone:', zoneName);
    if (!config.keys) return null;
    
    for (const key of config.keys) {
      if (key.zones?.includes(zoneName)) {
        console.log('Found key:', { ...key, keyValue: '[REDACTED]' });
        return key;
      }
    }
    console.log('No key found for zone:', zoneName);
    return null;
  }, [config.keys]);

  const loadZoneRecords = useCallback(async () => {
    if (!selectedZone) {
        console.log('No zone selected, skipping load');
        return;
    }
    
    console.log('Loading records for zone:', selectedZone);
    const keyConfig = getKeyForZone(selectedZone);
    
    if (!keyConfig) {
        console.error('No key configuration found for zone:', selectedZone);
        setError('No key configuration found for this zone');
        return;
    }

    console.log('Found key config:', {
        ...keyConfig,
        keyValue: '[REDACTED]'
    });

    setLoading(true);
    setError(null);
    
    try {
        console.log('Initiating zone transfer request');
        const zoneRecords = await dnsService.getZoneRecords(selectedZone, keyConfig);
        console.log(`Received ${zoneRecords.length} records`);
        setRecords(Array.isArray(zoneRecords) ? zoneRecords : []);
    } catch (err) {
        console.error('Failed to load zone records:', {
            error: err,
            message: err.message,
            zone: selectedZone
        });
        setError(err.message || 'Failed to load zone records');
        setRecords([]);
    } finally {
        setLoading(false);
    }
}, [selectedZone, getKeyForZone]);

  useEffect(() => {
    if (selectedZone) {
      loadZoneRecords();
    }
  }, [selectedZone, loadZoneRecords]);

  const handleCopyRecord = useCallback(async (record) => {
    try {
      const recordText = `${record.name} ${record.ttl} ${record.class} ${record.type} ${record.value}`;
      await navigator.clipboard.writeText(recordText);
      // Optionally show a success message
    } catch (error) {
      console.error('Failed to copy record:', error);
    }
  }, []);

  const renderRecordRow = (record) => (
    <TableRow key={`${record.name}-${record.type}-${record.value}`}>
      <TableCell>{record.name}</TableCell>
      <TableCell>{record.ttl}</TableCell>
      <TableCell>{record.class}</TableCell>
      <TableCell>
        <Chip label={record.type} size="small" />
      </TableCell>
      <TableCell>{record.value}</TableCell>
      <TableCell align="center">
        <Tooltip title="Copy record">
          <IconButton
            size="small"
            onClick={() => handleCopyRecord(record)}
          >
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );

  const filteredRecords = records.filter(record => {
    const matchesSearch = searchTerm === '' || 
      record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.value.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'ALL' || record.type === filterType;
    
    return matchesSearch && matchesType;
  });

  const getRecordTypeColor = (type) => {
    const colors = {
      A: 'primary',
      AAAA: 'secondary',
      CNAME: 'success',
      MX: 'warning',
      TXT: 'info',
      NS: 'error',
      SOA: 'default',
      PTR: 'primary',
      SRV: 'secondary'
    };
    return colors[type] || 'default';
  };

  // Add logging to zone selection
  const handleZoneChange = (e) => {
    const newZone = e.target.value;
    console.log('Zone selected:', newZone);
    console.log('Available keys:', config.keys);
    setSelectedZone(newZone);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Zone Viewer
        </Typography>
        <IconButton 
          onClick={loadZoneRecords} 
          disabled={!selectedZone || loading}
          color="primary"
        >
          <RefreshIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Select
          value={selectedZone}
          onChange={(e) => setSelectedZone(e.target.value)}
          displayEmpty
          fullWidth
          sx={{ mb: 2 }}
        >
          <MenuItem value="" disabled>
            Select a DNS Zone
          </MenuItem>
          {availableZones.map((zone) => (
            <MenuItem key={zone} value={zone}>
              {zone} ({getKeyForZone(zone)?.name || 'Unknown Key'})
            </MenuItem>
          ))}
        </Select>

        <TextField
          fullWidth
          label="Search Records"
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

        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          sx={{ minWidth: 120 }}
        >
          {recordTypes.map(type => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress />
        </Box>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>TTL</TableCell>
              <TableCell>Class</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Value</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRecords
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((record, index) => renderRecordRow(record))}
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
    </Paper>
  );
}

export default ZoneViewer;