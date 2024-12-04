import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Stack,
  Paper
} from '@mui/material';
import { useKey } from '../context/KeyContext';
import { useConfig } from '../context/ConfigContext';

function KeySelector() {
  const { config } = useConfig();
  const { 
    selectedKey, 
    selectedZone, 
    selectKey, 
    selectZone,
    availableZones = []
  } = useKey();

  const allKeys = config.keys || [];

  const handleKeyChange = (event) => {
    const keyId = event.target.value;
    const key = allKeys.find(k => k.id === keyId);
    selectKey(key);
    selectZone('');
  };

  const handleZoneChange = (event) => {
    const newZone = event.target.value;
    selectZone(newZone);
  };

  const keyZones = selectedKey?.zones || [];

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography 
        variant="subtitle2" 
        gutterBottom
        sx={{ 
          fontWeight: 500,
          color: 'text.primary',
          mb: 2
        }}
      >
        TSIG Key Selection
      </Typography>
      
      <Stack spacing={2}>
        <FormControl fullWidth size="small">
          <InputLabel>Key</InputLabel>
          <Select
            value={selectedKey?.id || ''}
            onChange={handleKeyChange}
            label="Key"
          >
            <MenuItem value="">
              <em>Select a key</em>
            </MenuItem>
            {allKeys.map((key) => (
              <MenuItem key={key.id} value={key.id}>
                {key.name || key.id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small" disabled={!selectedKey}>
          <InputLabel>Zone</InputLabel>
          <Select
            value={selectedZone || ''}
            onChange={handleZoneChange}
            label="Zone"
          >
            <MenuItem value="">
              <em>Select a zone</em>
            </MenuItem>
            {keyZones.map((zone) => (
              <MenuItem key={zone} value={zone}>
                {zone}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
}

export default KeySelector; 