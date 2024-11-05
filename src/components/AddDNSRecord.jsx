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
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';

function AddDNSRecord() {
  const navigate = useNavigate();
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

  // Get available keys from config
  const availableKeys = useMemo(() => {
    return config?.keys || [];
  }, [config?.keys]);

  // Get zones for selected key
  const keyZones = useMemo(() => {
    const key = availableKeys.find(k => k.id === selectedKey);
    return key?.zones || [];
  }, [availableKeys, selectedKey]);

  // Record types
  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedKey) {
      setError('Please select a DNS key');
      return;
    }

    try {
      const keyConfig = availableKeys.find(k => k.id === selectedKey);
      await dnsService.addRecord(
        formData.zone,
        {
          name: formData.name,
          type: formData.type,
          value: formData.value,
          ttl: parseInt(formData.ttl, 10)
        },
        keyConfig
      );

      // Clear form after successful submission
      setFormData({
        zone: '',
        name: '',
        type: 'A',
        value: '',
        ttl: '3600'
      });
      
      // Optionally show success message
    } catch (err) {
      setError(err.message);
    }
  };

  if (!availableKeys.length) {
    return (
      <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h6" gutterBottom>
          No DNS Keys Configured
        </Typography>
        <Typography paragraph>
          Before you can add DNS records, you need to configure at least one DNS key.
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
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Add DNS Record
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Key Selection */}
      <FormControl fullWidth margin="normal">
        <InputLabel>DNS Key</InputLabel>
        <Select
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            setFormData(prev => ({ ...prev, zone: '' })); // Reset zone when key changes
          }}
          required
        >
          <MenuItem value="" disabled>
            Select a DNS Key
          </MenuItem>
          {availableKeys.map(key => (
            <MenuItem key={key.id} value={key.id}>
              {key.name} ({key.type}) - {key.server}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Zone Selection/Input */}
      {selectedKey && (
        <Autocomplete
          value={formData.zone}
          onChange={(_, newValue) => {
            setFormData(prev => ({ ...prev, zone: newValue }));
          }}
          options={keyZones}
          freeSolo
          renderInput={(params) => (
            <TextField
              {...params}
              label="Zone"
              required
              fullWidth
              margin="normal"
              helperText={keyZones.length ? 
                "Select a managed zone or type a custom zone name" : 
                "Type a zone name"}
            />
          )}
        />
      )}

      {/* Show remaining fields only when both key and zone are selected */}
      {selectedKey && formData.zone && (
        <>
          <TextField
            name="name"
            label="Record Name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
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
            onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
            required
            fullWidth
            margin="normal"
          />

          <TextField
            name="ttl"
            label="TTL"
            type="number"
            value={formData.ttl}
            onChange={(e) => setFormData(prev => ({ ...prev, ttl: e.target.value }))}
            fullWidth
            margin="normal"
            helperText="Time To Live in seconds"
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 2 }}
          >
            Add Record
          </Button>
        </>
      )}
    </Box>
  );
}

export default AddDNSRecord;