import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Select,
  MenuItem,
  Button,
  Typography,
  Paper,
  Alert,
  Snackbar
} from '@mui/material';
import { dnsService } from '../services/dnsService';
import { usePendingChanges } from '../context/PendingChangesContext';
import { useConfig } from '../context/ConfigContext';

const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'PTR', 'SRV'];

function ZoneManager() {
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [recordType, setRecordType] = useState('A');
  const [recordName, setRecordName] = useState('');
  const [recordValue, setRecordValue] = useState('');
  const [ttl, setTtl] = useState(3600);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  
  const { addChange } = usePendingChanges();
  const { config } = useConfig();

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      const fetchedZones = await dnsService.getZones();
      setZones(fetchedZones);
    } catch (error) {
      setNotification({
        open: true,
        message: 'Failed to load zones',
        severity: 'error'
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const change = {
      zone: selectedZone,
      name: recordName,
      type: recordType,
      value: recordValue,
      ttl: ttl,
      command: `update add ${recordName}.${selectedZone} ${ttl} ${recordType} ${recordValue}`
    };

    addChange(change);
    setNotification({
      open: true,
      message: 'Change added to pending changes',
      severity: 'success'
    });

    // Clear form
    setRecordName('');
    setRecordValue('');
  };

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Add DNS Record
        </Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          <Select
            fullWidth
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            displayEmpty
            sx={{ mb: 2 }}
          >
            <MenuItem value="" disabled>
              Select a DNS Zone
            </MenuItem>
            {zones.map((zone) => (
              <MenuItem key={zone.name} value={zone.name}>
                {zone.name}
              </MenuItem>
            ))}
          </Select>

          <TextField
            fullWidth
            label="Record Name"
            value={recordName}
            onChange={(e) => setRecordName(e.target.value)}
            placeholder="www"
            helperText="Enter the subdomain name (without the zone)"
            sx={{ mb: 2 }}
          />

          <Select
            fullWidth
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            sx={{ mb: 2 }}
          >
            {recordTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </Select>

          <TextField
            fullWidth
            label="Record Value"
            value={recordValue}
            onChange={(e) => setRecordValue(e.target.value)}
            placeholder={recordType === 'A' ? '192.168.1.100' : 
                        recordType === 'AAAA' ? '2001:db8::1' :
                        recordType === 'CNAME' ? 'target.example.com.' :
                        recordType === 'MX' ? '10 mail.example.com.' :
                        recordType === 'TXT' ? 'v=spf1 include:_spf.example.com ~all' :
                        'Enter value'}
            helperText={`Enter the ${recordType} record value`}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            type="number"
            label="TTL"
            value={ttl}
            onChange={(e) => setTtl(parseInt(e.target.value))}
            placeholder={config.defaultTTL.toString()}
            helperText="Time To Live in seconds"
            sx={{ mb: 2 }}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
          >
            Add to Pending Changes
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
      >
        <Alert severity={notification.severity}>
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export default ZoneManager; 