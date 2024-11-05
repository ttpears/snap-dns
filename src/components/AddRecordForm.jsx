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
  Alert
} from '@mui/material';
import { useConfig } from '../context/ConfigContext';
import dnsService from '../services/dnsService';

function AddRecordForm() {
  const { config } = useConfig();
  const [formData, setFormData] = useState({
    zone: '',
    name: '',
    type: 'A',
    value: '',
    ttl: '3600',
    selectedKey: ''  // Add key selection
  });
  const [error, setError] = useState(null);

  // Get managed zones from config
  const managedZones = useMemo(() => {
    const zones = new Set();
    config.keys?.forEach(key => {
      key.zones?.forEach(zone => zones.add(zone));
    });
    return Array.from(zones);
  }, [config.keys]);

  // Get available keys for the selected zone
  const availableKeys = useMemo(() => {
    if (!formData.zone) return [];
    return config.keys?.filter(key => 
      key.zones?.includes(formData.zone) || !key.zones?.length
    ) || [];
  }, [config.keys, formData.zone]);

  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.selectedKey) {
        setError('Please select a key to use for this update');
        return;
    }

    try {
        const keyConfig = config.keys.find(k => k.id === formData.selectedKey);
        if (!keyConfig) {
            throw new Error('Selected key configuration not found');
        }

        await dnsService.addRecord(
            formData.zone,
            {
                name: formData.name,
                type: formData.type,
                value: formData.value,
                ttl: formData.ttl
            },
            keyConfig
        );

        // Clear form after successful submission
        setFormData({
            zone: '',
            name: '',
            type: 'A',
            value: '',
            ttl: '3600',
            selectedKey: ''
        });

        // Show success message (you might want to add a success state)
        // setSuccess('Record added successfully');
    } catch (err) {
        console.error('Failed to add record:', err);
        setError(err.message || 'Failed to add record');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

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

      <Autocomplete
        value={formData.zone}
        onChange={(event, newValue) => {
          setFormData(prev => ({
            ...prev,
            zone: newValue,
            selectedKey: ''  // Reset key selection when zone changes
          }));
        }}
        options={managedZones}
        freeSolo
        renderInput={(params) => (
          <TextField
            {...params}
            label="Zone"
            name="zone"
            required
            fullWidth
            margin="normal"
            helperText="Select a managed zone or type a custom zone name"
          />
        )}
      />

      {formData.zone && (
        <FormControl fullWidth margin="normal">
          <InputLabel>Key</InputLabel>
          <Select
            name="selectedKey"
            value={formData.selectedKey}
            onChange={handleChange}
            required
          >
            <MenuItem value="" disabled>
              Select a key
            </MenuItem>
            {availableKeys.map(key => (
              <MenuItem key={key.id} value={key.id}>
                {key.name} ({key.server})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <TextField
        name="name"
        label="Record Name"
        value={formData.name}
        onChange={handleChange}
        required
        fullWidth
        margin="normal"
        helperText={`Will be added to ${formData.zone || 'selected zone'}`}
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