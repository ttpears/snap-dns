import React, { useState, useMemo } from 'react';
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
  Grid
} from '@mui/material';

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
      helperText: 'Text record content, quotes will be added automatically if needed',
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
  }
};

function AddDNSRecord({ zone, selectedKey, onRecordAdded, addPendingChange, setShowPendingDrawer }) {
  const [record, setRecord] = useState({
    name: '',
    ttl: 3600,
    type: 'A',
    value: ''
  });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const currentTypeFields = useMemo(() => {
    return RECORD_TYPES[record.type]?.fields || [];
  }, [record.type]);

  const handleFieldChange = (fieldName, value) => {
    setRecord(prev => ({
      ...prev,
      [fieldName]: value
    }));

    // Clear field error when value changes
    if (fieldErrors[fieldName]) {
      setFieldErrors(prev => ({
        ...prev,
        [fieldName]: null
      }));
    }
  };

  const validateFields = () => {
    const errors = {};
    let isValid = true;

    // Validate common fields
    if (!record.name) {
      errors.name = 'Name is required';
      isValid = false;
    }

    if (!record.ttl || record.ttl < 0) {
      errors.ttl = 'Valid TTL is required';
      isValid = false;
    }

    // Validate type-specific fields
    currentTypeFields.forEach(field => {
      const value = record[field.name];
      if (field.required && !value) {
        errors[field.name] = `${field.label} is required`;
        isValid = false;
      } else if (field.validate && value && !field.validate(value)) {
        errors[field.name] = `Invalid ${field.label.toLowerCase()}`;
        isValid = false;
      }
    });

    setFieldErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!validateFields()) {
      return;
    }

    try {
      // Format record value based on type
      let formattedRecord = { ...record };
      if (record.type === 'MX') {
        formattedRecord.value = `${record.priority} ${record.value}`;
      } else if (record.type === 'SRV') {
        formattedRecord.value = `${record.priority} ${record.weight} ${record.port} ${record.target}`;
      } else if (record.type === 'CAA') {
        formattedRecord.value = `${record.flags} ${record.tag} "${record.value}"`;
      } else if (record.type === 'SSHFP') {
        formattedRecord.value = `${record.algorithm} ${record.fptype} ${record.fingerprint}`;
      }

      // Create pending change
      const change = {
        id: Date.now(),
        type: 'ADD',
        zone: zone,
        keyId: selectedKey,
        record: formattedRecord
      };

      // Add to pending changes
      addPendingChange(change);
      setShowPendingDrawer(true);

      // Call onRecordAdded callback to close modal
      if (onRecordAdded) {
        onRecordAdded(formattedRecord);
      }
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
      <Grid container spacing={2}>
        {/* Common fields */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Name"
            value={record.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            error={!!fieldErrors.name}
            helperText={fieldErrors.name || 'Record name relative to zone (@ for zone apex)'}
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
            error={!!fieldErrors.ttl}
            helperText={fieldErrors.ttl || 'Time to live in seconds'}
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

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
        <Button type="submit" variant="contained" color="primary">
          Add Record
        </Button>
      </Box>
    </Box>
  );
}

export default AddDNSRecord;
