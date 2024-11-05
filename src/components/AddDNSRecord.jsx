import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Alert,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';

function AddDNSRecord({ zone, onRecordAdded }) {
  const { config } = useConfig();
  const [newRecord, setNewRecord] = useState({
    name: '',
    ttl: 3600,
    type: 'A',
    value: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    try {
      console.log('Adding record for zone:', zone);
      console.log('Record details:', newRecord);

      const keyConfig = config.keys.find(key => 
        key.zones?.includes(zone)
      );

      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      await dnsService.addRecord(zone, newRecord, keyConfig);
      setSuccess(true);
      
      // Reset form
      setNewRecord({
        name: '',
        ttl: 3600,
        type: 'A',
        value: ''
      });

      // Notify parent component
      if (onRecordAdded) {
        onRecordAdded();
      }
    } catch (err) {
      console.error('Failed to add record:', err);
      setError(err.message);
    }
  };

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

      <TextField
        name="name"
        label="Record Name"
        value={newRecord.name}
        onChange={(e) => setNewRecord(prev => ({ ...prev, name: e.target.value }))}
        required
        fullWidth
        margin="normal"
        helperText={`Will be added to ${zone}`}
      />

      <FormControl fullWidth margin="normal">
        <InputLabel>Record Type</InputLabel>
        <Select
          name="type"
          value={newRecord.type}
          onChange={(e) => setNewRecord(prev => ({ ...prev, type: e.target.value }))}
          required
        >
          {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA'].map(type => (
            <MenuItem key={type} value={type}>{type}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        name="value"
        label="Record Value"
        value={newRecord.value}
        onChange={(e) => setNewRecord(prev => ({ ...prev, value: e.target.value }))}
        required
        fullWidth
        margin="normal"
      />

      <TextField
        name="ttl"
        label="TTL"
        type="number"
        value={newRecord.ttl}
        onChange={(e) => setNewRecord(prev => ({ ...prev, ttl: e.target.value }))}
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
    </Box>
  );
}

export default AddDNSRecord;
