import React, { useState, useEffect, useCallback } from 'react';
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

function RecordEditor({ record, onSave, onCancel, isCopy = false }) {
  const [editedRecord, setEditedRecord] = useState({
    name: record.name,
    type: record.type,
    value: record.value,
    ttl: record.ttl
  });

  const [structuredFields, setStructuredFields] = useState(() => {
    switch (record.type) {
      case 'SRV':
        const [priority, weight, port, target] = record.value.split(' ');
        return { priority, weight, port, target };
      case 'MX':
        const [preference, exchange] = record.value.split(' ');
        return { preference, exchange };
      case 'SSHFP':
        const [algorithm, fptype, fingerprint] = record.value.split(' ');
        return { algorithm, fptype, fingerprint };
      default:
        return {};
    }
  });

  const [hasChanges, setHasChanges] = useState(false);

  const checkForChanges = useCallback(() => {
    const baseChanged = 
      editedRecord.name !== record.name ||
      editedRecord.type !== record.type ||
      editedRecord.ttl !== record.ttl;

    let valueChanged = false;
    switch (editedRecord.type) {
      case 'SRV':
        valueChanged = 
          structuredFields.priority !== record.value.split(' ')[0] ||
          structuredFields.weight !== record.value.split(' ')[1] ||
          structuredFields.port !== record.value.split(' ')[2] ||
          structuredFields.target !== record.value.split(' ')[3];
        break;
      case 'MX':
        valueChanged = 
          structuredFields.preference !== record.value.split(' ')[0] ||
          structuredFields.exchange !== record.value.split(' ')[1];
        break;
      case 'SSHFP':
        valueChanged = 
          structuredFields.algorithm !== record.value.split(' ')[0] ||
          structuredFields.fptype !== record.value.split(' ')[1] ||
          structuredFields.fingerprint !== record.value.split(' ')[2];
        break;
      default:
        valueChanged = editedRecord.value !== record.value;
    }

    setHasChanges(baseChanged || valueChanged);
  }, [editedRecord, structuredFields, record]);

  useEffect(() => {
    checkForChanges();
  }, [editedRecord, structuredFields, checkForChanges]);

  const handleFieldChange = (field, value) => {
    setEditedRecord(prev => ({ ...prev, [field]: value }));
  };

  const handleStructuredFieldChange = (field, value) => {
    setStructuredFields(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isCopy && !hasChanges) {
      setError('Please modify at least one field to create a copy');
      return;
    }

    let finalValue = editedRecord.value;
    switch (editedRecord.type) {
      case 'SRV':
        finalValue = `${structuredFields.priority} ${structuredFields.weight} ${structuredFields.port} ${structuredFields.target}`;
        break;
      case 'MX':
        finalValue = `${structuredFields.preference} ${structuredFields.exchange}`;
        break;
      case 'SSHFP':
        finalValue = `${structuredFields.algorithm} ${structuredFields.fptype} ${structuredFields.fingerprint}`;
        break;
    }

    const finalRecord = {
      ...editedRecord,
      value: finalValue,
      id: isCopy ? undefined : editedRecord.id
    };

    onSave(finalRecord);
  };

  return (
    <>
      <DialogTitle>{isCopy ? 'Copy DNS Record' : 'Edit DNS Record'}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <TextField
            fullWidth
            label="Name"
            value={editedRecord.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={editedRecord.type}
              onChange={(e) => handleFieldChange('type', e.target.value)}
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

          {editedRecord.type === 'SRV' && (
            <>
              <TextField
                fullWidth
                label="Priority"
                value={structuredFields.priority}
                onChange={(e) => handleStructuredFieldChange('priority', e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Weight"
                value={structuredFields.weight}
                onChange={(e) => handleStructuredFieldChange('weight', e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Port"
                value={structuredFields.port}
                onChange={(e) => handleStructuredFieldChange('port', e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Target"
                value={structuredFields.target}
                onChange={(e) => handleStructuredFieldChange('target', e.target.value)}
                sx={{ mb: 2 }}
              />
            </>
          )}

          {editedRecord.type === 'MX' && (
            <>
              <TextField
                fullWidth
                label="Preference"
                value={structuredFields.preference}
                onChange={(e) => handleStructuredFieldChange('preference', e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Exchange"
                value={structuredFields.exchange}
                onChange={(e) => handleStructuredFieldChange('exchange', e.target.value)}
                sx={{ mb: 2 }}
              />
            </>
          )}

          {editedRecord.type === 'SSHFP' && (
            <>
              <TextField
                fullWidth
                label="Algorithm"
                value={structuredFields.algorithm}
                onChange={(e) => handleStructuredFieldChange('algorithm', e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Fingerprint Type"
                value={structuredFields.fptype}
                onChange={(e) => handleStructuredFieldChange('fptype', e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Fingerprint"
                value={structuredFields.fingerprint}
                onChange={(e) => handleStructuredFieldChange('fingerprint', e.target.value)}
                sx={{ mb: 2 }}
              />
            </>
          )}

          {editedRecord.type !== 'SRV' && editedRecord.type !== 'MX' && editedRecord.type !== 'SSHFP' && (
            <TextField
              fullWidth
              label="Value"
              value={editedRecord.value}
              onChange={(e) => handleFieldChange('value', e.target.value)}
              sx={{ mb: 2 }}
            />
          )}

          <TextField
            fullWidth
            label="TTL"
            type="number"
            value={editedRecord.ttl}
            onChange={(e) => handleFieldChange('ttl', parseInt(e.target.value, 10))}
            sx={{ mb: 2 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={isCopy && !hasChanges}
          color="primary"
        >
          {isCopy ? 'Create Copy' : 'Save Changes'}
        </Button>
      </DialogActions>
    </>
  );
}

export default RecordEditor; 