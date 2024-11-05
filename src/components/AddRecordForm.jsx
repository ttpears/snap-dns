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
  Paper,
  Link
} from '@mui/material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { useNavigate } from 'react-router-dom';

function AddRecordForm() {
  const navigate = useNavigate();
  const { config } = useConfig();
  const [formData, setFormData] = useState({
    zone: '',
    name: '',
    type: 'A',
    value: '',
    ttl: '3600',
    selectedKey: ''
  });
  const [error, setError] = useState(null);

  // Check if we have any configured keys
  const hasKeys = useMemo(() => {
    return config?.keys?.length > 0;
  }, [config?.keys]);

  // Get all available keys
  const availableKeys = useMemo(() => {
    return config?.keys || [];
  }, [config?.keys]);

  // Get zones from selected key
  const availableZones = useMemo(() => {
    if (!formData.selectedKey) return [];
    const selectedKey = availableKeys.find(k => k.id === formData.selectedKey);
    return selectedKey?.zones || [];
  }, [formData.selectedKey, availableKeys]);

  if (!hasKeys) {
    return (
      <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h6" gutterBottom>
          No DNS Keys Configured
        </Typography>
        <Typography paragraph>
          Before you can add or modify DNS records, you need to configure at least one DNS key.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => navigate('/settings')}
        >
          Go to Settings
        </Button>
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
        <InputLabel>DNS Key</InputLabel>
        <Select
          value={formData.selectedKey}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              selectedKey: e.target.value,
              zone: '' // Reset zone when key changes
            }));
          }}
          required
        >
          <MenuItem value="" disabled>
            Select a DNS Key
          </MenuItem>
          {availableKeys.map(key => (
            <MenuItem key={key.id} value={key.id}>
              {key.name} ({key.server})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {formData.selectedKey && (
        <Autocomplete
          value={formData.zone}
          onChange={(event, newValue) => {
            setFormData(prev => ({
              ...prev,
              zone: newValue || ''
            }));
          }}
          options={availableZones}
          freeSolo
          renderInput={(params) => (
            <TextField
              {...params}
              label="Zone"
              required
              fullWidth
              margin="normal"
              helperText={availableZones.length ? 
                "Select a managed zone or type a custom zone name" : 
                "Type a zone name"}
            />
          )}
        />
      )}

      {formData.zone && (
        <>
          <TextField
            name="name"
            label="Record Name"
            value={formData.name}
            onChange={handleChange}
            required
            fullWidth
            margin="normal"
            helperText={`Will be added to ${formData.zone}`}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Record Type</InputLabel>
            <Select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
            >
              {recordTypes.map(type => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            name="value"
            label="Record Value"
            value={formData.value}
            onChange={handleChange}
            required
            fullWidth
            margin="normal"
          />

          <TextField
            name="ttl"
            label="TTL"
            value={formData.ttl}
            onChange={handleChange}
            type="number"
            fullWidth
            margin="normal"
            helperText="Time To Live in seconds"
          />
        </>
      )}

      <Box sx={{ mt: 2 }}>
        <Button 
          type="submit" 
          variant="contained" 
          color="primary"
          disabled={!formData.zone || !formData.selectedKey}
        >
          Add Record
        </Button>
      </Box>
    </Box>
  );
}

export default AddRecordForm; 