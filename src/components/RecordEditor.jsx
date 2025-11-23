import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { DNSValidationService } from '../services/dnsValidationService';

function RecordEditor({ record, onSave, onCancel, isCopy = false }) {
  const [editedRecord, setEditedRecord] = useState({ ...record });
  const [error, setError] = useState(null);
  const [soaFields, setSOAFields] = useState({
    mname: '',
    rname: '',
    serial: 0,
    refresh: 3600,
    retry: 1800,
    expire: 604800,
    minimum: 86400
  });

  useEffect(() => {
    if (record.type === 'SOA') {
      if (typeof record.value === 'object') {
        setSOAFields(record.value);
      } else {
        // Parse the SOA string value into fields
        const parsed = DNSValidationService.parseSOAValue(record.value);
        setSOAFields(parsed);
      }
    }
    setEditedRecord({ ...record });
  }, [record]);

  const handleChange = (field, value) => {
    setEditedRecord(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
  };

  const handleSOAChange = (field, value) => {
    setSOAFields(prev => {
      const updated = {
        ...prev,
        [field]: value
      };
      // Update the main record value
      setEditedRecord(prev => ({
        ...prev,
        value: updated
      }));
      return updated;
    });
  };

  const renderSOAFields = () => {
    return (
      <>
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            SOA Record Fields
          </Typography>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Primary Nameserver (MNAME)"
            value={soaFields.mname}
            onChange={(e) => handleSOAChange('mname', e.target.value)}
            helperText="Fully qualified domain name of the primary nameserver"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Responsible Person (RNAME)"
            value={soaFields.rname}
            onChange={(e) => handleSOAChange('rname', e.target.value)}
            helperText="Email address with @ replaced by ."
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="number"
            label="Serial Number"
            value={soaFields.serial}
            disabled
            helperText="Auto-increments on save (read-only)"
          />
        </Grid>
        <Grid item xs={12}>
          <Alert severity="info">
            The serial number will automatically increment when you save changes. SOA records cannot be deleted.
          </Alert>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="number"
            label="Refresh Interval"
            value={soaFields.refresh}
            onChange={(e) => handleSOAChange('refresh', parseInt(e.target.value))}
            helperText="Seconds between zone refresh attempts"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="number"
            label="Retry Interval"
            value={soaFields.retry}
            onChange={(e) => handleSOAChange('retry', parseInt(e.target.value))}
            helperText="Seconds between retry attempts"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="number"
            label="Expire Time"
            value={soaFields.expire}
            onChange={(e) => handleSOAChange('expire', parseInt(e.target.value))}
            helperText="Seconds until zone is considered no longer authoritative"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            type="number"
            label="Minimum TTL"
            value={soaFields.minimum}
            onChange={(e) => handleSOAChange('minimum', parseInt(e.target.value))}
            helperText="Default minimum TTL for negative responses"
          />
        </Grid>
      </>
    );
  };

  const renderMXFields = () => {
    if (record.type !== 'MX') return null;
    
    const [priority = '', target = ''] = editedRecord.value.split(/\s+/);
    
    return (
      <>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            type="number"
            label="Priority"
            value={priority}
            onChange={(e) => {
              const newValue = `${e.target.value} ${target}`;
              handleChange('value', newValue);
            }}
            helperText="Lower numbers have higher priority (0-65535)"
          />
        </Grid>
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            label="Mail Server"
            value={target}
            onChange={(e) => {
              const newValue = `${priority} ${e.target.value}`;
              handleChange('value', newValue);
            }}
            helperText="Fully qualified domain name of the mail server"
          />
        </Grid>
      </>
    );
  };

  const renderSRVFields = () => {
    if (record.type !== 'SRV') return null;

    const [priority = '0', weight = '0', port = '', target = ''] = editedRecord.value.split(/\s+/);

    return (
      <>
        <Grid item xs={12} md={3}>
          <TextField
            fullWidth
            type="number"
            label="Priority"
            value={priority}
            onChange={(e) => updateSRVField('priority', e.target.value)}
            helperText="Lower numbers have higher priority"
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            fullWidth
            type="number"
            label="Weight"
            value={weight}
            onChange={(e) => updateSRVField('weight', e.target.value)}
            helperText="Relative weight for records with same priority"
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            fullWidth
            type="number"
            label="Port"
            value={port}
            onChange={(e) => updateSRVField('port', e.target.value)}
            helperText="TCP or UDP port number"
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            fullWidth
            label="Target"
            value={target}
            onChange={(e) => updateSRVField('target', e.target.value)}
            helperText="Hostname of the target server"
          />
        </Grid>
      </>
    );
  };

  const updateSRVField = (field, value) => {
    const parts = editedRecord.value.split(/\s+/);
    const indexes = { priority: 0, weight: 1, port: 2, target: 3 };
    parts[indexes[field]] = value;
    handleChange('value', parts.join(' '));
  };

  const renderTXTFields = () => {
    if (record.type !== 'TXT') return null;

    return (
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Text Value"
          value={record.value}
          onChange={(e) => {
            handleChange('value', e.target.value);
          }}
          multiline
          rows={4}
          helperText="Enter text content exactly as needed - no quotes will be added"
        />
      </Grid>
    );
  };

  const handleSave = () => {
    try {
      let processedRecord = { 
        ...editedRecord,
        id: isCopy ? undefined : editedRecord.id
      };

      // No special handling for TXT records - use value exactly as entered
      onSave(processedRecord);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <DialogContent>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Name"
            value={editedRecord.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="TTL"
            type="number"
            value={editedRecord.ttl}
            onChange={(e) => handleChange('ttl', parseInt(e.target.value))}
          />
        </Grid>
        
        {record.type === 'SOA' ? (
          renderSOAFields()
        ) : record.type === 'MX' ? (
          renderMXFields()
        ) : record.type === 'SRV' ? (
          renderSRVFields()
        ) : record.type === 'TXT' ? (
          renderTXTFields()
        ) : (
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Value"
              value={editedRecord.value}
              onChange={(e) => handleChange('value', e.target.value)}
              helperText={
                record.type === 'CNAME' ? 'Fully qualified domain name ending with a dot' :
                record.type === 'A' ? 'IPv4 address (e.g., 192.168.1.1)' :
                record.type === 'AAAA' ? 'IPv6 address' :
                undefined
              }
            />
          </Grid>
        )}
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {isCopy ? 'Create Copy' : 'Save Changes'}
        </Button>
      </DialogActions>
    </DialogContent>
  );
}

export default RecordEditor; 