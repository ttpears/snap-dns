import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  FormHelperText,
  Grid,
  CircularProgress
} from '@mui/material';
import { usePendingChanges } from '../context/PendingChangesContext';
import { useKey } from '../context/KeyContext';
import { dnsService } from '../services/dnsService';
import { useConfig } from '../context/ConfigContext';
import { DNSValidationService } from '../services/dnsValidationService';
import { DNSRecordFormatter } from '../services/dnsRecordFormatter';

// Record type definitions with their specific fields and validations
const RECORD_TYPES = {
  A: {
    fields: [{
      name: 'value',
      label: 'IPv4 Address',
      helperText: 'Enter a valid IPv4 address (e.g., 192.168.1.1)',
      validate: (value) => /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value),
      required: true
    }]
  },
  AAAA: {
    fields: [{
      name: 'value',
      label: 'IPv6 Address',
      helperText: 'Enter a valid IPv6 address',
      validate: (value) => /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i.test(value),
      required: true
    }]
  },
  CNAME: {
    fields: [{
      name: 'value',
      label: 'Target Hostname',
      helperText: 'Fully qualified domain name (FQDN) ending with a dot',
      validate: (value) => value.endsWith('.'),
      required: true
    }]
  },
  MX: {
    fields: [
      {
        name: 'priority',
        label: 'Priority',
        type: 'number',
        helperText: 'Lower numbers have higher priority (0-65535)',
        validate: (value) => value >= 0 && value <= 65535,
        required: true
      },
      {
        name: 'value',
        label: 'Mail Server',
        helperText: 'Fully qualified domain name of the mail server',
        validate: (value) => value.length > 0,
        required: true
      }
    ]
  },
  TXT: {
    fields: [{
      name: 'value',
      label: 'Text Value',
      helperText: 'Enter text content exactly as needed - no quotes will be added',
      multiline: true,
      rows: 3,
      required: true
    }]
  },
  SRV: {
    fields: [
      {
        name: 'priority',
        label: 'Priority',
        type: 'number',
        helperText: 'Lower numbers have higher priority (0-65535)',
        validate: (value) => value >= 0 && value <= 65535,
        required: true
      },
      {
        name: 'weight',
        label: 'Weight',
        type: 'number',
        helperText: 'Relative weight for records with the same priority',
        validate: (value) => value >= 0 && value <= 65535,
        required: true
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        helperText: 'TCP or UDP port number (0-65535)',
        validate: (value) => value >= 0 && value <= 65535,
        required: true
      },
      {
        name: 'target',
        label: 'Target',
        helperText: 'Hostname of the target server',
        required: true
      }
    ]
  },
  CAA: {
    fields: [
      {
        name: 'flags',
        label: 'Flags',
        type: 'number',
        helperText: 'CAA record flags (0-255)',
        validate: (value) => value >= 0 && value <= 255,
        required: true
      },
      {
        name: 'tag',
        label: 'Tag',
        helperText: 'CAA property (issue, issuewild, or iodef)',
        select: true,
        options: ['issue', 'issuewild', 'iodef'],
        required: true
      },
      {
        name: 'value',
        label: 'Value',
        helperText: 'Domain name of CA or reporting URL',
        required: true
      }
    ]
  },
  SSHFP: {
    fields: [
      {
        name: 'algorithm',
        label: 'Algorithm',
        type: 'number',
        helperText: 'SSH key algorithm (1=RSA, 2=DSA, 3=ECDSA, 4=Ed25519)',
        select: true,
        options: [
          { value: 1, label: 'RSA' },
          { value: 2, label: 'DSA' },
          { value: 3, label: 'ECDSA' },
          { value: 4, label: 'Ed25519' }
        ],
        required: true
      },
      {
        name: 'fptype',
        label: 'Fingerprint Type',
        type: 'number',
        helperText: 'Fingerprint type (1=SHA-1, 2=SHA-256)',
        select: true,
        options: [
          { value: 1, label: 'SHA-1' },
          { value: 2, label: 'SHA-256' }
        ],
        required: true
      },
      {
        name: 'fingerprint',
        label: 'Fingerprint',
        helperText: 'Hexadecimal fingerprint value',
        validate: (value) => /^[A-Fa-f0-9]+$/.test(value),
        required: true
      }
    ]
  },
  PTR: {
    fields: [{
      name: 'value',
      label: 'Target Hostname',
      helperText: 'Fully qualified domain name (FQDN) ending with a dot',
      validate: (value) => value.endsWith('.'),
      required: true
    }]
  }
};

const getReverseDNSZone = (zone) => {
  // Check if this is already a reverse DNS zone
  if (zone.endsWith('.in-addr.arpa') || zone.endsWith('.ip6.arpa')) {
    return zone;
  }
  return null;
};

function AddDNSRecord({ zone, onSuccess, onClose }) {
  const { selectedKey, selectedZone } = useKey();
  const { addPendingChange, setShowPendingDrawer, pendingChanges } = usePendingChanges();
  const { config } = useConfig();
  const [record, setRecord] = useState({
    name: '',
    ttl: config.defaultTTL || 3600,
    type: 'A',
    value: '',
    priority: 0,
    weight: 0,
    port: 0,
    target: '',
    flags: 0,
    tag: 'issue',
    algorithm: 1,
    fptype: 1,
    fingerprint: ''
  });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [ptrPreview, setPtrPreview] = useState('');

  useEffect(() => {
    if (record.type === 'PTR') {
      const reverseZone = getReverseDNSZone(selectedZone);
      if (!reverseZone) {
        setError({
          severity: 'warning',
          message: 'PTR records should only be created in reverse DNS zones (.in-addr.arpa or .ip6.arpa)'
        });
        return;
      }

      try {
        // Format the input as a proper PTR record
        let name = record.name;
        if (name) {
          // Remove any non-numeric characters except dots
          name = name.replace(/[^\d.]/g, '');
          
          // Split and reverse the octets if they haven't been reversed already
          if (!name.endsWith('.in-addr.arpa')) {
            const octets = name.split('.');
            if (octets.length <= 4) { // Handle partial IP address
              // Pad with empty strings to always have 4 parts
              while (octets.length < 4) {
                octets.push('');
              }
              // Reverse the octets
              name = octets.reverse().filter(Boolean).join('.');
            }
          }

          // Show the full PTR record name
          setPtrPreview(`${name}${name.endsWith('.') ? '' : '.'}${reverseZone}`);
        } else {
          setPtrPreview('');
        }
      } catch (err) {
        console.error('Error formatting PTR record:', err);
      }
    }
  }, [record.name, record.type, selectedZone]);

  const currentTypeFields = useMemo(() => {
    const fields = RECORD_TYPES[record.type]?.fields || [];
    
    if (record.type === 'PTR') {
      return [{
        name: 'name',
        label: 'IP Address',
        helperText: 'Enter the IP address for this PTR record',
        required: true
      }, ...fields];
    }
    
    return fields;
  }, [record.type]);

  const handleFieldChange = (fieldName, value) => {
    setRecord(prev => {
      const newRecord = {
        ...prev,
        [fieldName]: value
      };

      // Only validate the record name and TTL while typing
      if (selectedZone && (fieldName === 'name' || fieldName === 'ttl')) {
        let validationRecord = { ...newRecord };
        
        // Skip live validation for SRV records during typing
        if (newRecord.type === 'SRV' && fieldName === 'name') {
          // Clear any existing validation errors for the name field
          setValidationErrors(prev => ({
            ...prev,
            [fieldName]: null
          }));
          return newRecord;
        }

        // For other record types or TTL validation, proceed as normal
        const validation = DNSValidationService.validateRecord(validationRecord, selectedZone);
        setValidationErrors(validation.errors.reduce((acc, error) => {
          // Only show errors related to the current field
          if (error.toLowerCase().includes(fieldName)) {
            acc[fieldName] = error;
          }
          return acc;
        }, {}));
      }

      return newRecord;
    });

    // Clear field error when value changes
    if (fieldErrors[fieldName]) {
      setFieldErrors(prev => ({
        ...prev,
        [fieldName]: null
      }));
    }
  };

  const validateFields = () => {
    if (!selectedZone) {
      setError('Please select a zone first');
      return false;
    }

    // For SRV records, validate individual fields first
    if (record.type === 'SRV') {
      if (!record.priority || !record.weight || !record.port || !record.target) {
        setError('All SRV fields are required');
        return false;
      }
      // Create a temporary record with formatted value for validation
      const tempRecord = {
        ...record,
        value: `${record.priority} ${record.weight} ${record.port} ${record.target}`
      };
      const validation = DNSValidationService.validateRecord(tempRecord, selectedZone);
      if (!validation.isValid) {
        setValidationErrors(validation.errors.reduce((acc, error) => {
          // Map errors to fields based on content
          if (error.includes('name')) acc.name = error;
          else if (error.includes('TTL')) acc.ttl = error;
          else acc.value = error;
          return acc;
        }, {}));
        return false;
      }
    } else if (record.type === 'MX') {
      // Validate MX fields and compose value for validation
      if (record.priority == null || record.priority === '' || !record.value) {
        setError('Both MX priority and mail server are required');
        return false;
      }
      const tempRecord = {
        ...record,
        value: `${record.priority} ${record.value}`
      };
      const validation = DNSValidationService.validateRecord(tempRecord, selectedZone);
      if (!validation.isValid) {
        setValidationErrors(validation.errors.reduce((acc, error) => {
          if (error.includes('name')) acc.name = error;
          else if (error.includes('TTL')) acc.ttl = error;
          else acc.value = error;
          return acc;
        }, {}));
        return false;
      }
    } else {
      // For other record types, validate normally
      const validation = DNSValidationService.validateRecord(record, selectedZone);
      if (!validation.isValid) {
        setValidationErrors(validation.errors.reduce((acc, error) => {
          if (error.includes('name')) acc.name = error;
          else if (error.includes('TTL')) acc.ttl = error;
          else acc.value = error;
          return acc;
        }, {}));
        return false;
      }
    }

    return true;
  };

  const getRecordForSubmission = (record) => {
    // Base record fields that are always included
    const baseRecord = {
      name: record.name,
      ttl: record.ttl,
      type: record.type
    };

    // Add type-specific fields
    switch (record.type) {
      case 'A':
      case 'AAAA':
      case 'CNAME':
      case 'TXT':
        return {
          ...baseRecord,
          value: record.value
        };
      case 'MX':
        return {
          ...baseRecord,
          value: `${record.priority} ${record.value}`
        };
      case 'SRV':
        return {
          ...baseRecord,
          value: `${record.priority} ${record.weight} ${record.port} ${record.target}`
        };
      case 'CAA':
        return {
          ...baseRecord,
          value: `${record.flags} ${record.tag} "${record.value}"`
        };
      case 'SSHFP':
        return {
          ...baseRecord,
          value: `${record.algorithm} ${record.fptype} ${record.fingerprint}`
        };
      default:
        return {
          ...baseRecord,
          value: record.value
        };
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!validateFields()) {
        setSubmitting(false);
        return;
      }

      const cleanRecord = getRecordForSubmission(record);
      const formattedRecord = DNSRecordFormatter.formatRecord(cleanRecord, selectedZone);

      // Check for duplicate records in pending changes
      const isDuplicatePending = pendingChanges.some(change => 
        change.type === 'ADD' && 
        change.record.name === formattedRecord.name &&
        change.record.type === formattedRecord.type &&
        change.record.value === formattedRecord.value
      );

      if (isDuplicatePending) {
        setError('This record is already in pending changes');
        setSubmitting(false);
        return;
      }

      const change = {
        type: 'ADD',
        zone: selectedZone,
        keyId: selectedKey.id,
        record: formattedRecord
      };

      addPendingChange(change);
      setShowPendingDrawer(true);
      
      // Reset form
      setRecord({
        name: '',
        ttl: config.defaultTTL || 3600,
        type: 'A',
        value: '',
        priority: 0,
        weight: 0,
        port: 0,
        target: '',
        flags: 0,
        tag: 'issue',
        algorithm: 1,
        fptype: 1,
        fingerprint: ''
      });
      
      // Close the dialog if it's in a dialog
      if (onClose) {
        onClose();
      }

      // Call onSuccess if provided
      if (onSuccess) {
        onSuccess();
      }
      
    } catch (error) {
      if (error.message.includes('Record already exists')) {
        setError('This record already exists in the zone');
      } else {
        setError(`Failed to add record: ${error.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box 
      component="form" 
      onSubmit={handleSubmit} 
      sx={{ p: 3 }}
    >
      <Grid container spacing={2}>
        {/* Common fields */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Name"
            value={record.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            error={!!validationErrors.name}
            helperText={validationErrors.name || 'Record name relative to zone (@ for zone apex)'}
            required
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="TTL"
            type="number"
            value={record.ttl}
            onChange={(e) => handleFieldChange('ttl', parseInt(e.target.value))}
            error={!!validationErrors.ttl}
            helperText={validationErrors.ttl || 'Time to live in seconds'}
            required
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Record Type</InputLabel>
            <Select
              value={record.type}
              onChange={(e) => handleFieldChange('type', e.target.value)}
              label="Record Type"
            >
              {Object.keys(RECORD_TYPES).map((type) => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Dynamic fields based on record type */}
        {currentTypeFields.map((field) => (
          <Grid item xs={12} sm={field.type === 'number' ? 6 : 12} key={field.name}>
            {field.select ? (
              <FormControl fullWidth error={!!fieldErrors[field.name]}>
                <InputLabel>{field.label}</InputLabel>
                <Select
                  value={record[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  label={field.label}
                >
                  {field.options.map((option) => (
                    <MenuItem 
                      key={typeof option === 'object' ? option.value : option} 
                      value={typeof option === 'object' ? option.value : option}
                    >
                      {typeof option === 'object' ? option.label : option}
                    </MenuItem>
                  ))}
                </Select>
                {field.helperText && <FormHelperText>{fieldErrors[field.name] || field.helperText}</FormHelperText>}
              </FormControl>
            ) : (
              <TextField
                fullWidth
                label={field.label}
                type={field.type || 'text'}
                value={record[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                error={!!fieldErrors[field.name]}
                helperText={fieldErrors[field.name] || field.helperText}
                required={field.required}
                multiline={field.multiline}
                rows={field.rows}
              />
            )}
          </Grid>
        ))}
      </Grid>

      {record.type === 'PTR' && ptrPreview && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            This will create a PTR record with name:
            <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: 'background.paper' }}>
              {ptrPreview}
            </Box>
          </Typography>
        </Alert>
      )}

      {error && (
        <Alert 
          severity={error.severity || 'error'} 
          sx={{ mt: 2 }}
          action={
            error.details && (
              <Button 
                color="inherit" 
                size="small"
                onClick={() => {
                  console.info('Error details:', error.details);
                  // Could also show details in a dialog/tooltip
                }}
              >
                Details
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {success}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
        <Button 
          type="submit" 
          variant="contained" 
          color="primary"
          disabled={submitting}
        >
          {submitting ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            'Add Record'
          )}
        </Button>
      </Box>
    </Box>
  );
}

export default AddDNSRecord;
