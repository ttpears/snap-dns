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
import { usePendingChanges } from '../context/PendingChangesContext';

function AddDNSRecord() {
  const { config } = useConfig();
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [manualZone, setManualZone] = useState('');
  const [useManualZone, setUseManualZone] = useState(false);
  const [newRecord, setNewRecord] = useState({
    name: '',
    ttl: 3600,
    type: 'A',
    value: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { addPendingChange, setShowPendingDrawer } = usePendingChanges();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    try {
      const keyConfig = config.keys.find(key => key.id === selectedKey);
      if (!keyConfig) {
        throw new Error('No key configuration found');
      }

      const zone = useManualZone ? manualZone : selectedZone;
      
      // Create the pending change
      const change = {
        type: 'ADD',
        zone: zone,
        name: newRecord.name,
        recordType: newRecord.type,
        value: newRecord.value,
        ttl: newRecord.ttl,
        keyId: selectedKey,
        newRecord: {
          ...newRecord,
          zone: zone
        }
      };

      // Add to pending changes
      addPendingChange(change);
      setSuccess(true);
      setShowPendingDrawer(true);
      
      // Reset form
      setNewRecord({
        name: '',
        ttl: config.defaultTTL || 3600,
        type: 'A',
        value: ''
      });
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Add DNS Record
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        {/* Key Selection */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Select Key</InputLabel>
          <Select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            label="Select Key"
            required
          >
            {config.keys.map((key) => (
              <MenuItem key={key.id} value={key.id}>
                {key.name} ({key.server})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Zone Selection */}
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setUseManualZone(!useManualZone)}
            sx={{ mb: 1 }}
          >
            {useManualZone ? 'Select from Managed Zones' : 'Enter Zone Manually'}
          </Button>

          {useManualZone ? (
            <TextField
              fullWidth
              label="Enter Zone"
              value={manualZone}
              onChange={(e) => setManualZone(e.target.value)}
              required
            />
          ) : (
            <FormControl fullWidth>
              <InputLabel>Select Zone</InputLabel>
              <Select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                label="Select Zone"
                required
              >
                {selectedKey && config.keys.find(k => k.id === selectedKey)?.zones.map((zone) => (
                  <MenuItem key={zone} value={zone}>
                    {zone}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Record Details */}
        <TextField
          fullWidth
          label="Name"
          value={newRecord.name}
          onChange={(e) => setNewRecord({ ...newRecord, name: e.target.value })}
          sx={{ mb: 2 }}
          required
        />

        <TextField
          fullWidth
          label="TTL"
          type="number"
          value={newRecord.ttl}
          onChange={(e) => setNewRecord({ ...newRecord, ttl: parseInt(e.target.value) })}
          sx={{ mb: 2 }}
          required
        />

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Record Type</InputLabel>
          <Select
            value={newRecord.type}
            onChange={(e) => setNewRecord({ ...newRecord, type: e.target.value })}
            label="Record Type"
            required
          >
            {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'].map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label="Value"
          value={newRecord.value}
          onChange={(e) => setNewRecord({ ...newRecord, value: e.target.value })}
          sx={{ mb: 2 }}
          required
        />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Record added successfully
          </Alert>
        )}

        <Button type="submit" variant="contained" color="primary">
          Add Record
        </Button>
      </Box>
    </Paper>
  );
}

export default AddDNSRecord;
