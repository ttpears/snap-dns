import React, { useState } from 'react';
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
  Alert
} from '@mui/material';

function RecordEditor({ record, onSave, onCancel }) {
  const [editedRecord, setEditedRecord] = useState({
    name: record.name,
    type: record.type,
    value: record.value,
    ttl: record.ttl
  });
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    try {
      onSave(editedRecord);
    } catch (err) {
      setError(err.message);
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
              <MenuItem value="CAA">CAA</MenuItem>
              <MenuItem value="SSHFP">SSHFP</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Value"
            value={editedRecord.value}
            onChange={(e) => setEditedRecord(prev => ({ ...prev, value: e.target.value }))}
            sx={{ mb: 2 }}
          />

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