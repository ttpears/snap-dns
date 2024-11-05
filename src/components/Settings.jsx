import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Stack
} from '@mui/material';
import { useConfig } from '../context/ConfigContext';

function Settings() {
  const { config, updateConfig } = useConfig();
  const [newKey, setNewKey] = useState({
    id: '',
    name: '',
    server: '',
    keyName: '',
    keyValue: '',
    algorithm: 'hmac-sha512',
    zones: [],
    type: 'internal'
  });
  const [currentZone, setCurrentZone] = useState('');
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewKey(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddZone = () => {
    if (currentZone && !newKey.zones.includes(currentZone)) {
      setNewKey(prev => ({
        ...prev,
        zones: [...prev.zones, currentZone]
      }));
      setCurrentZone('');
    }
  };

  const handleRemoveZone = (zoneToRemove) => {
    setNewKey(prev => ({
      ...prev,
      zones: prev.zones.filter(zone => zone !== zoneToRemove)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    try {
      const updatedKeys = [...(config.keys || []), newKey];
      updateConfig({ ...config, keys: updatedKeys });
      
      // Reset form
      setNewKey({
        id: '',
        name: '',
        server: '',
        keyName: '',
        keyValue: '',
        algorithm: 'hmac-sha512',
        zones: [],
        type: 'internal'
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Add DNS Key
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          name="name"
          label="Key Name"
          value={newKey.name}
          onChange={handleInputChange}
          fullWidth
          margin="normal"
          required
        />

        <TextField
          name="server"
          label="DNS Server"
          value={newKey.server}
          onChange={handleInputChange}
          fullWidth
          margin="normal"
          required
        />

        <TextField
          name="keyName"
          label="TSIG Key Name"
          value={newKey.keyName}
          onChange={handleInputChange}
          fullWidth
          margin="normal"
          required
        />

        <TextField
          name="keyValue"
          label="TSIG Key Value"
          value={newKey.keyValue}
          onChange={handleInputChange}
          fullWidth
          margin="normal"
          required
        />

        <FormControl fullWidth margin="normal">
          <InputLabel>Algorithm</InputLabel>
          <Select
            name="algorithm"
            value={newKey.algorithm}
            onChange={handleInputChange}
            required
          >
            <MenuItem value="hmac-sha512">HMAC-SHA512</MenuItem>
            <MenuItem value="hmac-sha384">HMAC-SHA384</MenuItem>
            <MenuItem value="hmac-sha256">HMAC-SHA256</MenuItem>
            <MenuItem value="hmac-sha224">HMAC-SHA224</MenuItem>
            <MenuItem value="hmac-sha1">HMAC-SHA1</MenuItem>
            <MenuItem value="hmac-md5">HMAC-MD5</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth margin="normal">
          <InputLabel>Type</InputLabel>
          <Select
            name="type"
            value={newKey.type}
            onChange={handleInputChange}
            required
          >
            <MenuItem value="internal">Internal</MenuItem>
            <MenuItem value="external">External</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Managed Zones
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            {newKey.zones.map((zone) => (
              <Chip
                key={zone}
                label={zone}
                onDelete={() => handleRemoveZone(zone)}
              />
            ))}
          </Stack>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              value={currentZone}
              onChange={(e) => setCurrentZone(e.target.value)}
              label="Add Zone"
              size="small"
              fullWidth
            />
            <Button
              onClick={handleAddZone}
              variant="outlined"
              disabled={!currentZone}
            >
              Add
            </Button>
          </Box>
        </Box>

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 3 }}
        >
          Add Key
        </Button>
      </Box>
    </Paper>
  );
}

export default Settings;