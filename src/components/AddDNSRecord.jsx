import React, { useState, useMemo } from 'react';
import {
  TextField,
  Button,
  Box,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Autocomplete,
  Typography,
  Alert,
  Paper
} from '@mui/material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';

function AddDNSRecord() {
  const { config } = useConfig();
  const [selectedKey, setSelectedKey] = useState('');
  const [formData, setFormData] = useState({
    zone: '',
    name: '',
    type: 'A',
    value: '',
    ttl: '3600'
  });
  const [error, setError] = useState(null);

  const availableKeys = useMemo(() => {
    return config?.keys || [];
  }, [config?.keys]);

  const selectedKeyConfig = useMemo(() => {
    return availableKeys.find(k => k.id === selectedKey);
  }, [availableKeys, selectedKey]);

  const handleKeyChange = (event) => {
    setSelectedKey(event.target.value);
    setFormData(prev => ({ ...prev, zone: '' })); // Reset zone when key changes
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedKey || !formData.zone) return;

    try {
      await dnsService.addRecord(formData.zone, formData, selectedKeyConfig);
      // Handle success
    } catch (err) {
      setError(err.message);
    }
  };

  if (!availableKeys.length) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" color="error">
          No DNS Keys Configured
        </Typography>
        <Typography>
          Please configure DNS keys in Settings before adding records.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600 }}>
      <Typography variant="h6" gutterBottom>
        Add DNS Record
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <FormControl fullWidth margin="normal">
        <InputLabel>Select DNS Key</InputLabel>
        <Select
          value={selectedKey}
          onChange={handleKeyChange}
          required
        >
          {availableKeys.map(key => (
            <MenuItem key={key.id} value={key.id}>
              {key.name} ({key.type})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedKey && (
        <Autocomplete
          value={formData.zone}
          onChange={(_, newValue) => {
            setFormData(prev => ({ ...prev, zone: newValue }));
          }}
          options={selectedKeyConfig?.zones || []}
          freeSolo
          renderInput={(params) => (
            <TextField
              {...params}
              label="Zone"
              required
              fullWidth
              margin="normal"
              helperText="Select a managed zone or enter a custom zone"
            />
          )}
        />
      )}

      {formData.zone && (
        <>
          {/* Existing record fields */}
        </>
      )}
    </Box>
  );
}

export default AddDNSRecord; 