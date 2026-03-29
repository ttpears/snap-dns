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

interface FieldDefinition {
  name: string;
  label: string;
  type?: string;
  helperText?: string;
  validate?: (value: any) => boolean;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  select?: boolean;
  options?: Array<string | { value: number; label: string }>;
}

interface RecordTypeDefinition {
  fields: FieldDefinition[];
}

const RECORD_TYPES: Record<string, RecordTypeDefinition> = {
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

const mapErrorToField = (error: string): string => {
  const lower = (error || '').toLowerCase();
  if (lower.includes('ttl')) return 'ttl';
  if (/\brecord name\b/.test(lower)) return 'name';
  if (/\bname\b/.test(lower) && !/host\s*name|hostname/.test(lower)) return 'name';
  return 'value';
};

const getReverseDNSZone = (zone: string): string | null => {
  if (zone.endsWith('.in-addr.arpa') || zone.endsWith('.ip6.arpa')) {
    return zone;
  }
  return null;
};

interface AddDNSRecordProps {
  zone?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

type ErrorState = string | { severity?: string; message: string; details?: any } | null;

function AddDNSRecord({ zone, onSuccess, onClose }: AddDNSRecordProps) {
  const { selectedKey, selectedZone } = useKey();
  const { addPendingChange, setShowPendingDrawer, pendingChanges } = usePendingChanges();
  const { config } = useConfig();
  const [record, setRecord] = useState<Record<string, any>>({
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
  const [error, setError] = useState<ErrorState>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [ptrPreview, setPtrPreview] = useState('');

  useEffect(() => {
    if (record.type === 'PTR') {
      const reverseZone = getReverseDNSZone(selectedZone ?? '');
      if (!reverseZone) {
        setError({
          severity: 'warning',
          message: 'PTR records should only be created in reverse DNS zones (.in-addr.arpa or .ip6.arpa)'
        });
        return;
      }

      try {
        let name = record.name;
        if (name) {
          name = name.replace(/[^\d.]/g, '');

          if (!name.endsWith('.in-addr.arpa')) {
            const octets = name.split('.');
            if (octets.length <= 4) {
              while (octets.length < 4) {
                octets.push('');
              }
              name = octets.reverse().filter(Boolean).join('.');
            }
          }

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

  const handleFieldChange = (fieldName: string, value: any) => {
    setRecord(prev => {
      const newRecord = {
        ...prev,
        [fieldName]: value
      };

      if (selectedZone && (fieldName === 'name' || fieldName === 'ttl')) {
        let validationRecord = { ...newRecord };

        if (newRecord.type === 'SRV' && fieldName === 'name') {
          setValidationErrors(prev => ({
            ...prev,
            [fieldName]: null
          }));
          return newRecord;
        }

        const validation = DNSValidationService.validateRecord(validationRecord, selectedZone);
        setValidationErrors(validation.errors.reduce((acc: Record<string, string | null>, error: string) => {
          if (mapErrorToField(error) === fieldName) {
            acc[fieldName] = error;
          }
          return acc;
        }, {}));
      }

      return newRecord;
    });

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

    if (record.type === 'SRV') {
      if (!record.priority || !record.weight || !record.port || !record.target) {
        setError('All SRV fields are required');
        return false;
      }
      const tempRecord = {
        ...record,
        value: `${record.priority} ${record.weight} ${record.port} ${record.target}`
      };
      const validation = DNSValidationService.validateRecord(tempRecord, selectedZone);
      if (!validation.isValid) {
        const errMap = validation.errors.reduce((acc: Record<string, string | null>, error: string) => {
          const field = mapErrorToField(error);
          acc[field] = error;
          return acc;
        }, {});
        setValidationErrors(errMap);
        setFieldErrors(errMap);
        return false;
      }
    } else if (record.type === 'MX') {
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
        const errMap = validation.errors.reduce((acc: Record<string, string | null>, error: string) => {
          const field = mapErrorToField(error);
          acc[field] = error;
          return acc;
        }, {});
        setValidationErrors(errMap);
        setFieldErrors(errMap);
        return false;
      }
    } else {
      const validation = DNSValidationService.validateRecord(record, selectedZone);
      if (!validation.isValid) {
        const errMap = validation.errors.reduce((acc: Record<string, string | null>, error: string) => {
          const field = mapErrorToField(error);
          acc[field] = error;
          return acc;
        }, {});
        setValidationErrors(errMap);
        setFieldErrors(errMap);
        return false;
      }
    }

    return true;
  };

  const getRecordForSubmission = (record: any): any => {
    const baseRecord = {
      name: record.name,
      ttl: record.ttl,
      type: record.type
    };

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

  const handleSubmit = async (event: React.FormEvent) => {
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
      const formattedRecord = DNSRecordFormatter.formatRecord(cleanRecord, selectedZone ?? '');

      const isDuplicatePending = pendingChanges.some((change: any) =>
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

      const change: import('../types/dns').PendingChange = {
        type: 'ADD',
        zone: selectedZone ?? '',
        keyId: selectedKey!.id,
        record: formattedRecord
      };

      addPendingChange(change);

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

      if (onClose) {
        onClose();
      }

      if (onSuccess) {
        onSuccess();
      }

    } catch (error) {
      if ((error as Error).message.includes('Record already exists')) {
        setError('This record already exists in the zone');
      } else {
        setError(`Failed to add record: ${(error as Error).message}`);
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
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Name"
            value={record.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            error={!!validationErrors.name}
            helperText={validationErrors.name || 'Record name relative to zone (@ for zone apex)'}
            required
            inputProps={{ name: 'name' }}
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
            inputProps={{ name: 'ttl' }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Record Type</InputLabel>
            <Select
              value={record.type}
              onChange={(e) => handleFieldChange('type', e.target.value)}
              label="Record Type"
              SelectDisplayProps={{ id: 'record-type-select' } as React.HTMLAttributes<HTMLDivElement>}
            >
              {Object.keys(RECORD_TYPES).map((type) => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {currentTypeFields.map((field) => (
          <Grid item xs={12} sm={field.type === 'number' ? 6 : 12} key={field.name}>
            {field.select ? (
              <FormControl fullWidth error={!!fieldErrors[field.name]}>
                <InputLabel>{field.label}</InputLabel>
                <Select
                  value={(record as any)[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  label={field.label}
                >
                  {(field.options || []).map((option) => (
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
                value={(record as any)[field.name] || ''}
                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                error={!!fieldErrors[field.name]}
                helperText={fieldErrors[field.name] || field.helperText}
                required={field.required}
                multiline={field.multiline}
                rows={field.rows}
                inputProps={{ name: field.name }}
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
          severity={(typeof error === 'object' && error !== null ? error.severity : undefined) as any || 'error'}
          sx={{ mt: 2 }}
          action={
            typeof error === 'object' && error !== null && error.details ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  console.info('Error details:', (error as { severity?: string; message: string; details?: any }).details);
                }}
              >
                Details
              </Button>
            ) : undefined
          }
        >
          {typeof error === 'string' ? error : error.message}
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
