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
    }
  }, [record]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    try {
      let finalValue = editedRecord.value;

      if (editedRecord.type === 'SOA') {
        finalValue = soaFields;
      } else if (editedRecord.type === 'TXT') {
        // Handle TXT record formatting
        finalValue = editedRecord.value.split('\n').join(' ');
      }

      onSave({
        ...editedRecord,
        value: finalValue
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const renderValueField = () => {
    switch (editedRecord.type) {
      case 'SOA':
        return (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle2">SOA Record Details</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Primary Nameserver (MNAME)"
                value={soaFields.mname}
                onChange={(e) => setSOAFields(prev => ({ ...prev, mname: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Admin Email (RNAME)"
                value={soaFields.rname}
                onChange={(e) => setSOAFields(prev => ({ ...prev, rname: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Serial"
                value={soaFields.serial}
                onChange={(e) => setSOAFields(prev => ({ ...prev, serial: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Refresh (seconds)"
                value={soaFields.refresh}
                onChange={(e) => setSOAFields(prev => ({ ...prev, refresh: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Retry (seconds)"
                value={soaFields.retry}
                onChange={(e) => setSOAFields(prev => ({ ...prev, retry: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Expire (seconds)"
                value={soaFields.expire}
                onChange={(e) => setSOAFields(prev => ({ ...prev, expire: parseInt(e.target.value) }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label="Minimum TTL (seconds)"
                value={soaFields.minimum}
                onChange={(e) => setSOAFields(prev => ({ ...prev, minimum: parseInt(e.target.value) }))}
              />
            </Grid>
          </Grid>
        );

      case 'TXT':
        return (
          <TextField
            fullWidth
            label="Value"
            value={editedRecord.value}
            onChange={(e) => setEditedRecord(prev => ({ ...prev, value: e.target.value }))}
            multiline
            rows={4}
            sx={{ mb: 2 }}
          />
        );

      default:
        return (
          <TextField
            fullWidth
            label="Value"
            value={editedRecord.value}
            onChange={(e) => setEditedRecord(prev => ({ ...prev, value: e.target.value }))}
            sx={{ mb: 2 }}
          />
        );
    }
  };

  return (
    <>
      <DialogTitle>Edit DNS Record</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ pt: 2 }}>
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
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
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

          {renderValueField()}

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