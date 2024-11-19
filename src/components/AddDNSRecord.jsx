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
  InputLabel,
  FormControlLabel,
  Switch
} from '@mui/material';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { usePendingChanges } from '../context/PendingChangesContext';
import { qualifyDnsName } from '../utils/dnsUtils';
import { useZone } from '../context/ZoneContext';
import { Badge } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';

function AddDNSRecord({ zone, selectedKey, onRecordAdded }) {
  const { config } = useConfig();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { addPendingChange, setShowPendingDrawer, pendingChanges } = usePendingChanges();
  const [newRecord, setNewRecord] = useState({
    name: '',
    ttl: 3600,
    type: 'A',
    value: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    try {
      const keyConfig = config.keys.find(key => key.id === selectedKey);
      if (!keyConfig) {
        throw new Error('No key configuration found');
      }

      const change = {
        type: 'ADD',
        zone: zone,
        keyId: selectedKey,
        name: newRecord.name,
        recordType: newRecord.type,
        value: newRecord.value,
        ttl: newRecord.ttl
      };

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

      if (onRecordAdded) {
        onRecordAdded();
      }
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Add DNS Record</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setShowPendingDrawer(true)}
          startIcon={
            pendingChanges.length > 0 ? (
              <Badge badgeContent={pendingChanges.length} color="error">
                <EditIcon />
              </Badge>
            ) : (
              <EditIcon />
            )
          }
        >
          Pending Changes ({pendingChanges.length})
        </Button>
      </Box>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
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
            {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SSHFP'].map((type) => (
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
