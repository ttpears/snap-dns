import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';

function KeyManagement() {
  const { config, updateConfig } = useConfig();
  const [editingKey, setEditingKey] = useState(null);
  const [error, setError] = useState(null);
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
        updatedKeys = config.keys.map(key => 
          key.id === editingKey ? { ...newKey } : key
        );
      } else {
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
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Key Management
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Key Name"
            name="name"
            value={newKey.name}
            onChange={handleInputChange}
            required
            fullWidth
          />

          <TextField
            label="Server"
            name="server"
            value={newKey.server}
            onChange={handleInputChange}
            required
            fullWidth
          />

          <TextField
            label="Key Name (TSIG)"
            name="keyName"
            value={newKey.keyName}
            onChange={handleInputChange}
            required
            fullWidth
          />

          <TextField
            label="Key Value"
            name="keyValue"
            value={newKey.keyValue}
            onChange={handleInputChange}
            required
            fullWidth
          />

          <FormControl fullWidth>
            <InputLabel>Algorithm</InputLabel>
            <Select
              name="algorithm"
              value={newKey.algorithm}
              onChange={handleInputChange}
              label="Algorithm"
            >
              <MenuItem value="hmac-sha512">HMAC-SHA512</MenuItem>
              <MenuItem value="hmac-sha256">HMAC-SHA256</MenuItem>
              <MenuItem value="hmac-sha1">HMAC-SHA1</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Add Zone"
              value={currentZone}
              onChange={(e) => setCurrentZone(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="contained"
              onClick={handleAddZone}
              disabled={!currentZone}
            >
              Add
            </Button>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {newKey.zones.map((zone, index) => (
              <Chip
                key={index}
                label={zone}
                onDelete={() => handleRemoveZone(zone)}
              />
            ))}
          </Box>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            startIcon={editingKey ? <SaveIcon /> : <AddIcon />}
          >
            {editingKey ? 'Update Key' : 'Add Key'}
          </Button>
        </Box>
      </Box>

      <List sx={{ mt: 3 }}>
        {config.keys?.map((key) => (
          <ListItem key={key.id} divider>
            <ListItemText
              primary={key.name}
              secondaryTypographyProps={{ component: 'div' }}
              secondary={
                <Box sx={{ mt: 1 }}>
                  <Box sx={{ mb: 0.5 }}>
                    Server: {key.server}
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {key.zones.map((zone, index) => (
                      <Chip key={index} label={zone} size="small" />
                    ))}
                  </Box>
                </Box>
              }
            />
            <ListItemSecondaryAction>
              <IconButton onClick={() => handleEditKey(key)}>
                <EditIcon />
              </IconButton>
              <IconButton onClick={() => handleDeleteKey(key.id)}>
                <DeleteIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}

export default KeyManagement; 