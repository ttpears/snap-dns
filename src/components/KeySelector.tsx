// src/components/KeySelector.tsx
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
  Paper,
  FormHelperText
} from '@mui/material';
import { useKey } from '../context/KeyContext';
import { isReverseZone } from '../services/dnsRecordFormatter';
import SearchIcon from '@mui/icons-material/Search';

// Sentinel option value in the main zone dropdown that opens the reverse-zone
// sub-selection instead of committing a zone. Cannot collide with a real zone.
const REVERSE_SENTINEL = '__REVERSE_ZONES__';
// Above this many reverse zones, collapse them behind the sub-selection so they
// don't flood the main zone list.
const REVERSE_GROUP_THRESHOLD = 5;

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
  // Whether the reverse sub-dropdown is revealed after choosing the sentinel.
  const [reverseOpen, setReverseOpen] = useState(false);

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

  // Zones actually shown in the dropdown: the sorted/filtered list narrowed to
  // the selected key (if any). Partition into forward and reverse groups.
  const visibleZones = useMemo(
    () => filteredZones.filter(zone => !selectedKey || selectedKey.zones?.includes(zone)),
    [filteredZones, selectedKey]
  );
  const forwardZones = useMemo(() => visibleZones.filter(z => !isReverseZone(z)), [visibleZones]);
  const reverseZones = useMemo(() => visibleZones.filter(z => isReverseZone(z)), [visibleZones]);

  // Only collapse reverse zones into a sub-selection once there are enough of
  // them to be worth hiding; otherwise they stay inline in the main dropdown.
  const groupReverse = reverseZones.length > REVERSE_GROUP_THRESHOLD;
  const selectedIsReverse = !!validSelectedZone && isReverseZone(validSelectedZone);
  const showReverseSelect = groupReverse && (reverseOpen || selectedIsReverse);

  const renderKeyOptions = () => {
    return (
      <FormControl fullWidth>
        <InputLabel id="key-select-label">Select Key</InputLabel>
        <Select
          labelId="key-select-label"
          value={selectedKey?.id || ''}
          onChange={(e) => {
            const key = availableKeys.find(k => k.id === e.target.value);
            if (key) {
              // Verify all required fields are present (secret not required - keys stored server-side)
              const requiredFields = ['id', 'name', 'algorithm', 'server'] as const;
              const missingFields = requiredFields.filter(field => !key[field]);
              if (missingFields.length > 0) {
                console.error('Missing key fields:', missingFields);
              }
            }
            selectKey(key || null);
          }}
          label="Select Key"
          SelectDisplayProps={{ id: 'key-select' } as React.HTMLAttributes<HTMLDivElement>}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {availableKeys.map((key) => {
            return (
              <MenuItem key={key.id} value={key.id}>
                {key.name} ({key.server})
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
    );
  };

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
      
      {renderKeyOptions()}

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
        <InputLabel id="zone-select-label">Select Zone</InputLabel>
        <Select
          labelId="zone-select-label"
          value={groupReverse && selectedIsReverse ? REVERSE_SENTINEL : validSelectedZone}
          onChange={(e) => {
            const value = e.target.value;
            if (value === REVERSE_SENTINEL) {
              // Reveal the sub-selection without committing a zone.
              setReverseOpen(true);
              return;
            }
            setReverseOpen(false);
            selectZone(value || null);
          }}
          label="Select Zone"
          SelectDisplayProps={{ id: 'zone-select' } as React.HTMLAttributes<HTMLDivElement>}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {(groupReverse ? forwardZones : visibleZones).map((zone) => (
            <MenuItem key={zone} value={zone}>
              {zone}
            </MenuItem>
          ))}
          {groupReverse && (
            <MenuItem value={REVERSE_SENTINEL}>
              Reverse zones ({reverseZones.length})…
            </MenuItem>
          )}
        </Select>
        <FormHelperText>
          {validSelectedZone
            ? `Managing ${validSelectedZone}`
            : !selectedKey
              ? 'Select a zone and a matching key is chosen automatically'
              : 'Select a zone to manage'}
        </FormHelperText>
      </FormControl>

      {showReverseSelect && (
        <FormControl fullWidth>
          <InputLabel id="reverse-zone-select-label">Reverse Zone</InputLabel>
          <Select
            labelId="reverse-zone-select-label"
            value={selectedIsReverse ? validSelectedZone : ''}
            onChange={(e) => selectZone(e.target.value || null)}
            label="Reverse Zone"
            SelectDisplayProps={{ id: 'reverse-zone-select' } as React.HTMLAttributes<HTMLDivElement>}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {reverseZones.map((zone) => (
              <MenuItem key={zone} value={zone}>
                {zone}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

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