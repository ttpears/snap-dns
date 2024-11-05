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
  Stack,
  IconButton
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';

function Settings() {
  const { config, updateConfig } = useConfig();
  const [editingKey, setEditingKey] = useState(null);
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

  const resetForm = () => {
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
    setEditingKey(null);
    setCurrentZone('');
  };

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

  const handleEditKey = (key) => {
    setNewKey({ ...key });
    setEditingKey(key.id);
  };

  const handleDeleteKey = (keyId) => {
    const updatedKeys = config.keys.filter(key => key.id !== keyId);
    updateConfig({ ...config, keys: updatedKeys });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    try {
      let updatedKeys;
      if (editingKey) {
        // Update existing key
        updatedKeys = config.keys.map(key => 
          key.id === editingKey ? { ...newKey } : key
        );
      } else {
        // Add new key
        const keyToSave = {
          ...newKey,
          id: `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        updatedKeys = [...(config.keys || []), keyToSave];
      }

      updateConfig({ ...config, keys: updatedKeys });
      resetForm();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          {editingKey ? 'Edit DNS Key' : 'Add DNS Key'}
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

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
            >
              {editingKey ? 'Update Key' : 'Add Key'}
            </Button>
            {editingKey && (
              <Button
                variant="outlined"
                color="secondary"
                fullWidth
                onClick={resetForm}
              >
                Cancel Edit
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      {config.keys?.length > 0 && (
        <Box sx={{ mt: 4, maxWidth: 600, mx: 'auto' }}>
          <Typography variant="h6" gutterBottom>
            Existing Keys
          </Typography>
          {config.keys.map((key) => (
            <Paper key={key.id} sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="subtitle1">{key.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Server: {key.server}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    {key.zones.map((zone) => (
                      <Chip
                        key={zone}
                        label={zone}
                        size="small"
                        sx={{ mr: 1, mb: 1 }}
                      />
                    ))}
                  </Box>
                </Box>
                <Box>
                  <IconButton onClick={() => handleEditKey(key)} size="small">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDeleteKey(key.id)} size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default Settings;