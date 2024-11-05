import React, { useState, useCallback, useEffect } from 'react';
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
import { dnsService } from '../services/dnsService';
import { localConfig } from '../config/local';

function ZoneViewer() {
  const [selectedZone, setSelectedZone] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const recordTypes = ['ALL', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR', 'SRV'];

  const getKeyForZone = useCallback((zoneName) => {
    console.log('Looking for key for zone:', zoneName);
    for (const key of localConfig.keys) {
      if (key.zones.includes(zoneName)) {
        console.log('Found key:', { ...key, keyValue: '[REDACTED]' });
        return key;
      }
    }
    return null;
  }, []);

  const loadZoneRecords = useCallback(async () => {
    if (!selectedZone) {
      console.log('No zone selected');
      return;
    }
    
    console.log('Loading records for zone:', selectedZone);
    const keyConfig = getKeyForZone(selectedZone);
    
    if (!keyConfig) {
      console.error('No key configuration found for zone:', selectedZone);
      setError('No key configuration found for this zone');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('Fetching records with key config:', {
        ...keyConfig,
        keyValue: '[REDACTED]'
      });
      
      const zoneRecords = await dnsService.getZoneRecords(selectedZone, keyConfig);
      console.log(`Received ${zoneRecords.length} records`);
      setRecords(Array.isArray(zoneRecords) ? zoneRecords : []);
    } catch (err) {
      console.error('Failed to load zone records:', err);
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

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

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

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Zone Viewer
        </Typography>
        <IconButton 
          onClick={() => {
            console.log('Refresh clicked for zone:', selectedZone);
            loadZoneRecords();
          }} 
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
        >
          <MenuItem value="" disabled>
            Select a DNS Zone
          </MenuItem>
          {localConfig.keys.flatMap(key => 
            key.zones.map(zone => (
              <MenuItem key={`${key.id}-${zone}`} value={zone}>
                {zone} ({key.name})
              </MenuItem>
            ))
          )}
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

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>TTL</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : filteredRecords
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((record, index) => (
                  <TableRow key={`${record.name}-${record.type}-${index}`}>
                    <TableCell>
                      <Chip 
                        label={record.type}
                        size="small"
                        color={getRecordTypeColor(record.type)}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Click to copy">
                        <Box 
                          component="span" 
                          sx={{ cursor: 'pointer' }}
                          onClick={() => handleCopyToClipboard(record.name)}
                        >
                          {record.name}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Click to copy">
                        <Box 
                          component="span" 
                          sx={{ cursor: 'pointer' }}
                          onClick={() => handleCopyToClipboard(record.value)}
                        >
                          {record.value}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{record.ttl}</TableCell>
                    <TableCell align="right">
                      <IconButton 
                        size="small"
                        onClick={() => handleCopyToClipboard(
                          `${record.name} ${record.ttl} IN ${record.type} ${record.value}`
                        )}
                      >
                        <CopyIcon fontSize="small" />
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
    </Paper>
  );
}

export default ZoneViewer;