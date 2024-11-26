import React, { useState, useEffect } from 'react';
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Alert,
  Grid,
  Typography
} from '@mui/material';

function RecordEditor({ record, onSave, onCancel }) {
  const [editedRecord, setEditedRecord] = useState({
    name: record.name,
    type: record.type,
    value: record.value,
    ttl: record.ttl
  });

  const [soaFields, setSOAFields] = useState({
    mname: '',
    rname: '',
    serial: 0,
    refresh: 0,
    retry: 0,
    expire: 0,
    minimum: 0
  });

  const [error, setError] = useState(null);

  const [structuredFields, setStructuredFields] = useState({});

  useEffect(() => {
    if (record.type === 'SOA' && typeof record.value === 'object') {
      setSOAFields({
        mname: record.value.mname || '',
        rname: record.value.rname || '',
        serial: record.value.serial || 0,
        refresh: record.value.refresh || 0,
        retry: record.value.retry || 0,
        expire: record.value.expire || 0,
        minimum: record.value.minimum || 0
      });
    } else if (record.type === 'SRV') {
      const [priority, weight, port, target] = record.value.split(' ');
      setStructuredFields({
        priority: parseInt(priority) || 0,
        weight: parseInt(weight) || 0,
        port: parseInt(port) || 0,
        target: target || ''
      });
    } else if (record.type === 'MX') {
      const [preference, exchange] = record.value.split(' ');
      setStructuredFields({
        preference: parseInt(preference) || 0,
        exchange: exchange || ''
      });
    } else if (record.type === 'SSHFP') {
      const [algorithm, fptype, fingerprint] = record.value.split(' ');
      setStructuredFields({
        algorithm: parseInt(algorithm) || 1,
        fptype: parseInt(fptype) || 1,
        fingerprint: fingerprint || ''
      });
    }
  }, [record]);

  const renderFields = () => {
    switch (editedRecord.type) {
      case 'SOA':
        return (
          <Box sx={{ my: 2 }}>
            <TextField
              label="Primary NS (MNAME)"
              value={soaFields.mname}
              onChange={(e) => setSOAFields({ ...soaFields, mname: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Responsible Person (RNAME)"
              value={soaFields.rname}
              onChange={(e) => setSOAFields({ ...soaFields, rname: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Serial"
              type="number"
              value={soaFields.serial}
              onChange={(e) => setSOAFields({ ...soaFields, serial: parseInt(e.target.value) })}
              fullWidth
              required
            />
            <TextField
              label="Refresh (seconds)"
              type="number"
              value={soaFields.refresh}
              onChange={(e) => setSOAFields({ ...soaFields, refresh: parseInt(e.target.value) })}
              fullWidth
              required
            />
            <TextField
              label="Retry (seconds)"
              type="number"
              value={soaFields.retry}
              onChange={(e) => setSOAFields({ ...soaFields, retry: parseInt(e.target.value) })}
              fullWidth
              required
            />
            <TextField
              label="Expire (seconds)"
              type="number"
              value={soaFields.expire}
              onChange={(e) => setSOAFields({ ...soaFields, expire: parseInt(e.target.value) })}
              fullWidth
              required
            />
            <TextField
              label="Minimum TTL (seconds)"
              type="number"
              value={soaFields.minimum}
              onChange={(e) => setSOAFields({ ...soaFields, minimum: parseInt(e.target.value) })}
              fullWidth
              required
            />
          </Box>
        );

      case 'SRV':
        return (
          <Box sx={{ my: 2 }}>
            <TextField
              label="Priority"
              type="number"
              value={structuredFields.priority}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                priority: parseInt(e.target.value) 
              })}
              fullWidth
              required
            />
            <TextField
              label="Weight"
              type="number"
              value={structuredFields.weight}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                weight: parseInt(e.target.value) 
              })}
              fullWidth
              required
            />
            <TextField
              label="Port"
              type="number"
              value={structuredFields.port}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                port: parseInt(e.target.value) 
              })}
              fullWidth
              required
            />
            <TextField
              label="Target"
              value={structuredFields.target}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                target: e.target.value 
              })}
              fullWidth
              required
            />
          </Box>
        );

      case 'MX':
        return (
          <Box sx={{ my: 2 }}>
            <TextField
              label="Preference"
              type="number"
              value={structuredFields.preference}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                preference: parseInt(e.target.value) 
              })}
              fullWidth
              required
            />
            <TextField
              label="Exchange"
              value={structuredFields.exchange}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                exchange: e.target.value 
              })}
              fullWidth
              required
            />
          </Box>
        );

      case 'SSHFP':
        return (
          <Box sx={{ my: 2 }}>
            <FormControl fullWidth required>
              <InputLabel>Algorithm</InputLabel>
              <Select
                value={structuredFields.algorithm}
                onChange={(e) => setStructuredFields({ 
                  ...structuredFields, 
                  algorithm: e.target.value 
                })}
                label="Algorithm"
              >
                <MenuItem value={1}>RSA</MenuItem>
                <MenuItem value={2}>DSA</MenuItem>
                <MenuItem value={3}>ECDSA</MenuItem>
                <MenuItem value={4}>Ed25519</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel>Fingerprint Type</InputLabel>
              <Select
                value={structuredFields.fptype}
                onChange={(e) => setStructuredFields({ 
                  ...structuredFields, 
                  fptype: e.target.value 
                })}
                label="Fingerprint Type"
              >
                <MenuItem value={1}>SHA-1</MenuItem>
                <MenuItem value={2}>SHA-256</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Fingerprint"
              value={structuredFields.fingerprint}
              onChange={(e) => setStructuredFields({ 
                ...structuredFields, 
                fingerprint: e.target.value 
              })}
              fullWidth
              required
              helperText="Hexadecimal fingerprint value"
            />
          </Box>
        );

      default:
        return (
          <Box sx={{ my: 2 }}>
            <TextField
              label="Value"
              value={editedRecord.value}
              onChange={(e) => setEditedRecord({ 
                ...editedRecord, 
                value: e.target.value 
              })}
              fullWidth
              required
              multiline={editedRecord.type === 'TXT'}
            />
          </Box>
        );
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    try {
      let finalValue = editedRecord.value;

      switch (editedRecord.type) {
        case 'SOA':
          finalValue = soaFields;
          break;
        case 'SRV':
          finalValue = `${structuredFields.priority} ${structuredFields.weight} ${structuredFields.port} ${structuredFields.target}`;
          break;
        case 'MX':
          finalValue = `${structuredFields.preference} ${structuredFields.exchange}`;
          break;
        case 'SSHFP':
          finalValue = `${structuredFields.algorithm} ${structuredFields.fptype} ${structuredFields.fingerprint}`;
          break;
        case 'TXT':
          finalValue = editedRecord.value.split('\n').join(' ');
          break;
      }

      onSave({
        ...editedRecord,
        value: finalValue
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <DialogTitle>Edit DNS Record</DialogTitle>
      <DialogContent>
        <Box 
          component="form" 
          onSubmit={handleSubmit} 
          sx={{ 
            pt: 2,
            '& .MuiTextField-root, & .MuiFormControl-root': { 
              mb: 2  // Add margin bottom to all TextField and FormControl components
            }
          }}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            label="Name"
            value={editedRecord.name}
            onChange={(e) => setEditedRecord(prev => ({ ...prev, name: e.target.value }))}
          />

          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              value={editedRecord.type}
              onChange={(e) => setEditedRecord(prev => ({ ...prev, type: e.target.value }))}
              label="Type"
            >
              <MenuItem value="A">A</MenuItem>
              <MenuItem value="AAAA">AAAA</MenuItem>
              <MenuItem value="CNAME">CNAME</MenuItem>
              <MenuItem value="MX">MX</MenuItem>
              <MenuItem value="TXT">TXT</MenuItem>
              <MenuItem value="SRV">SRV</MenuItem>
              <MenuItem value="NS">NS</MenuItem>
              <MenuItem value="PTR">PTR</MenuItem>
              <MenuItem value="SOA">SOA</MenuItem>
              <MenuItem value="CAA">CAA</MenuItem>
              <MenuItem value="SSHFP">SSHFP</MenuItem>
            </Select>
          </FormControl>

          {renderFields()}

          <TextField
            fullWidth
            label="TTL"
            type="number"
            value={editedRecord.ttl}
            onChange={(e) => setEditedRecord(prev => ({ ...prev, ttl: parseInt(e.target.value, 10) }))}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">
          Save Changes
        </Button>
      </DialogActions>
    </>
  );
}

export default RecordEditor; 