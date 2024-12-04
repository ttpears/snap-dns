import React, { useState, useMemo } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  InputAdornment,
  Paper
} from '@mui/material';
import { useKey } from '../context/KeyContext';
import SearchIcon from '@mui/icons-material/Search';

function KeySelector() {
  const { 
    selectedKey, 
    selectedZone, 
    selectKey, 
    selectZone, 
    availableZones, 
    availableKeys 
  } = useKey();
  const [zoneFilter, setZoneFilter] = useState('');

  // Sort zones: numeric first, then alphabetical
  const sortedZones = useMemo(() => {
    return [...availableZones].sort((a, b) => {
      const aIsNumeric = /^\d+$/.test(a.split('.')[0]);
      const bIsNumeric = /^\d+$/.test(b.split('.')[0]);
      
      if (aIsNumeric && !bIsNumeric) return -1;
      if (!aIsNumeric && bIsNumeric) return 1;
      
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [availableZones]);

  // Filter and sort zones
  const filteredZones = useMemo(() => {
    if (!zoneFilter) return sortedZones;
    
    return sortedZones.filter(zone => 
      zone.toLowerCase().includes(zoneFilter.toLowerCase())
    );
  }, [sortedZones, zoneFilter]);

  // Validate selected zone is in available zones
  const validSelectedZone = selectedZone && availableZones.includes(selectedZone) ? selectedZone : '';

  return (
    <Paper 
      sx={{ 
        p: 3,
        mb: 2,
        '& .MuiFormControl-root': {
          mb: 2
        }
      }}
    >
      <Typography 
        variant="h6" 
        gutterBottom 
        sx={{ 
          mb: 3,
          fontWeight: 500
        }}
      >
        TSIG Key Selection
      </Typography>
      
      <FormControl fullWidth>
        <InputLabel>Select Key</InputLabel>
        <Select
          value={selectedKey?.id || ''}
          onChange={(e) => {
            const key = availableKeys.find(k => k.id === e.target.value);
            selectKey(key || null);
          }}
          label="Select Key"
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {availableKeys.map((key) => (
            <MenuItem key={key.id} value={key.id}>
              {key.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {availableZones.length > 10 && (
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Filter Zones"
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      <FormControl fullWidth>
        <InputLabel>Select Zone</InputLabel>
        <Select
          value={validSelectedZone}
          onChange={(e) => selectZone(e.target.value || null)}
          label="Select Zone"
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {filteredZones.map((zone) => (
            <MenuItem key={zone} value={zone}>
              {zone}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedKey && (
        <Typography 
          variant="caption" 
          color="text.secondary"
          sx={{ 
            display: 'block',
            mt: 1,
            fontStyle: 'italic',
            textAlign: 'right'
          }}
        >
          Server: {selectedKey.server}
        </Typography>
      )}
    </Paper>
  );
}

export default KeySelector; 