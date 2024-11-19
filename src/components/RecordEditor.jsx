import React, { useState } from 'react';
import { Box, Typography, Grid, TextField, Button, Alert } from '@mui/material';
import { KeyConfig } from '../config';

// Record type enum
export enum RecordType {
  A = 'A',
  AAAA = 'AAAA',
  CNAME = 'CNAME',
  MX = 'MX',
  TXT = 'TXT',
  SRV = 'SRV',
  NS = 'NS',
  PTR = 'PTR',
  CAA = 'CAA',
  SOA = 'SOA',
  SSHFP = 'SSHFP'
}

// Base DNS record interface
export interface DNSRecord {
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
}

// Pending change interface for tracking modifications
export interface PendingChange {
  type: 'ADD' | 'MODIFY' | 'DELETE';
  zone: string;
  keyId: string;
  record?: DNSRecord;
  originalRecord?: DNSRecord;
  newRecord?: DNSRecord;
  name?: string;
  recordType?: RecordType;
  value?: string;
  ttl?: number;
}

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// DNS operation result
export interface DNSOperationResult {
  success: boolean;
  message: string;
  error?: string;
}

export function RecordEditor({ record, onSave, onCancel, selectedKey }) {
  const [editedRecord, setEditedRecord] = useState({ ...record });
  const [error, setError] = useState(null);

  const isSOA = record.type === 'SOA';
  const isMultiline = ['TXT', 'SPF'].includes(record.type) || isSOA;

  // Initialize SOA form state if it's an SOA record
  const [soaFields, setSOAFields] = useState(
    isSOA ? {
      mname: record.value.mname || '',
      rname: record.value.rname || '',
      serial: record.value.serial || 0,
      refresh: record.value.refresh || 3600,
      retry: record.value.retry || 900,
      expire: record.value.expire || 604800,
      minimum: record.value.minimum || 86400
    } : null
  );

  const handleSOAChange = (field) => (event) => {
    const value = field === 'mname' || field === 'rname' ? 
      event.target.value : 
      parseInt(event.target.value) || 0;

    setSOAFields(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    try {
      if (isSOA) {
        onSave({
          ...editedRecord,
          value: soaFields,
          keyId: selectedKey
        });
      } else {
        onSave({
          ...editedRecord,
          keyId: selectedKey
        });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (isSOA) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Edit SOA Record</Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Primary Nameserver (MNAME)"
              value={soaFields.mname}
              onChange={handleSOAChange('mname')}
              helperText="Fully qualified domain name of the primary nameserver"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Admin Email (RNAME)"
              value={soaFields.rname}
              onChange={handleSOAChange('rname')}
              helperText="Email address of the administrator (use dots instead of @)"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Serial"
              value={soaFields.serial}
              onChange={handleSOAChange('serial')}
              helperText="Zone version number (YYYYMMDDNN format recommended)"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Refresh (seconds)"
              value={soaFields.refresh}
              onChange={handleSOAChange('refresh')}
              helperText="Time between slave refresh attempts"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Retry (seconds)"
              value={soaFields.retry}
              onChange={handleSOAChange('retry')}
              helperText="Time between slave retry attempts"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Expire (seconds)"
              value={soaFields.expire}
              onChange={handleSOAChange('expire')}
              helperText="Time until slave stops trying"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="number"
              label="Minimum TTL (seconds)"
              value={soaFields.minimum}
              onChange={handleSOAChange('minimum')}
              helperText="Minimum TTL for negative caching"
            />
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </Box>
      </Box>
    );
  }

  // For other multiline records
  if (isMultiline) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Edit {record.type} Record</Typography>
        
        <TextField
          fullWidth
          multiline
          rows={4}
          label="Value"
          value={typeof editedRecord.value === 'object' ? 
            JSON.stringify(editedRecord.value, null, 2) : 
            editedRecord.value}
          onChange={(e) => setEditedRecord({
            ...editedRecord,
            value: e.target.value
          })}
          helperText={`Enter ${record.type} record value`}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </Box>
      </Box>
    );
  }

  // For simple records (existing implementation)
  return (
    <Box sx={{ p: 2 }}>
      <TextField
        fullWidth
        label="Value"
        value={editedRecord.value}
        onChange={(e) => setEditedRecord({
          ...editedRecord,
          value: e.target.value
        })}
        sx={{ mb: 2 }}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </Box>
    </Box>
  );
} 