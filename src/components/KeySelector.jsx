import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Button,
  Alert
} from '@mui/material';
import { useKey } from '../context/KeyContext';
import { useNavigate } from 'react-router-dom';

function KeySelector() {
  const { keys, selectedKey, selectedZone, selectKey, selectZone } = useKey();
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        TSIG Key & Zone
      </Typography>
      
      {keys.length === 0 ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          No TSIG keys configured
        </Alert>
      ) : (
        <>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Select Key</InputLabel>
            <Select
              value={selectedKey?.id || ''}
              onChange={(e) => {
                const key = keys.find(k => k.id === e.target.value);
                selectKey(key);
              }}
              label="Select Key"
            >
              {keys.map((key) => (
                <MenuItem key={key.id} value={key.id}>
                  {key.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedKey && selectedKey.zones?.length > 0 && (
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel>Select Zone</InputLabel>
              <Select
                value={selectedZone || ''}
                onChange={(e) => selectZone(e.target.value)}
                label="Select Zone"
              >
                {selectedKey.zones.map((zone) => (
                  <MenuItem key={zone} value={zone}>
                    {zone}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </>
      )}
      
      <Button
        size="small"
        variant="outlined"
        onClick={() => navigate('/settings')}
        sx={{ width: '100%' }}
      >
        {keys.length === 0 ? 'Add TSIG Key' : 'Manage Keys'}
      </Button>
    </Box>
  );
}

export default KeySelector; 