import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  IconButton,
  Alert
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';

function Settings() {
  const { config, updateConfig } = useConfig();
  const [error, setError] = useState(null);
  const [newKey, setNewKey] = useState({
    id: '',
    name: '',
    server: '',
    keyName: '',
    keyValue: '',
    algorithm: 'hmac-sha512',
    zones: []
  });

  const handleAddKey = (e) => {
    e.preventDefault();
    setError(null);

    try {
      // Validate required fields
      if (!newKey.name || !newKey.server || !newKey.keyName || !newKey.keyValue) {
        throw new Error('Please fill in all required fields');
      }

      // Create unique ID if not provided
      const keyId = newKey.id || `key-${Date.now()}`;

      // Update config with new key
      const updatedKeys = [...(config.keys || []), { ...newKey, id: keyId }];
      updateConfig({ ...config, keys: updatedKeys });

      // Reset form
      setNewKey({
        id: '',
        name: '',
        server: '',
        keyName: '',
        keyValue: '',
        algorithm: 'hmac-sha512',
        zones: []
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewKey(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        DNS Key Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleAddKey} sx={{ mt: 2 }}>
        <TextField
          name="name"
          label="Key Name"
          value={newKey.name}
          onChange={handleInputChange}
          fullWidth
          required
          margin="normal"
        />

        <TextField
          name="server"
          label="DNS Server"
          value={newKey.server}
          onChange={handleInputChange}
          fullWidth
          required
          margin="normal"
        />

        <TextField
          name="keyName"
          label="TSIG Key Name"
          value={newKey.keyName}
          onChange={handleInputChange}
          fullWidth
          required
          margin="normal"
        />

        <TextField
          name="keyValue"
          label="TSIG Key Value"
          value={newKey.keyValue}
          onChange={handleInputChange}
          fullWidth
          required
          margin="normal"
          type="password"
        />

        <TextField
          name="algorithm"
          label="Algorithm"
          value={newKey.algorithm}
          onChange={handleInputChange}
          fullWidth
          margin="normal"
          helperText="Default: hmac-sha512"
        />

        <TextField
          name="zones"
          label="Managed Zones"
          value={newKey.zones.join(', ')}
          onChange={(e) => {
            const zonesText = e.target.value;
            setNewKey(prev => ({
              ...prev,
              zones: zonesText.split(',').map(z => z.trim()).filter(Boolean)
            }));
          }}
          fullWidth
          margin="normal"
          helperText="Comma-separated list of zones"
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          sx={{ mt: 2 }}
        >
          Add Key
        </Button>
      </Box>

      {/* Display existing keys */}
      {config.keys?.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Configured Keys
          </Typography>
          {config.keys.map(key => (
            <Paper key={key.id} sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle1">{key.name}</Typography>
              <Typography variant="body2">Server: {key.server}</Typography>
              <Typography variant="body2">Key Name: {key.keyName}</Typography>
              <Typography variant="body2">
                Zones: {key.zones?.join(', ') || 'No zones configured'}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Paper>
  );
}

export default Settings;