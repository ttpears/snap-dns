import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondary,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Stack,
  Tooltip,
  InputAdornment
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { useKey } from '../context/KeyContext';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useConfig } from '../context/ConfigContext';

function KeyManagement() {
  const { config, updateConfig } = useConfig();
  const { keys = [] } = config;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [newKey, setNewKey] = useState({
    name: '',
    algorithm: 'hmac-sha256',
    secret: '',
    server: '',
    zones: [],
    created: null
  });
  const [zoneInput, setZoneInput] = useState('');
  const [error, setError] = useState(null);
  const [zoneSearchText, setZoneSearchText] = useState('');

  const handleOpenDialog = (key = null) => {
    if (key) {
      setEditingKey(key);
      setNewKey({
        name: key.name || '',
        algorithm: key.algorithm || 'hmac-sha256',
        secret: key.secret || '',
        server: key.server || '',
        zones: key.zones || [],
        created: key.created || null
      });
    } else {
      setEditingKey(null);
      setNewKey({
        name: '',
        algorithm: 'hmac-sha256',
        secret: '',
        server: '',
        zones: [],
        created: null
      });
    }
    setDialogOpen(true);
    setZoneInput('');
    setError(null);
  };

  const handleAddZone = () => {
    if (!zoneInput.trim()) return;
    
    setNewKey(prev => ({
      ...prev,
      zones: [...new Set([...prev.zones, zoneInput.trim()])]
    }));
    setZoneInput('');
  };

  const handleRemoveZone = (zoneToRemove) => {
    setNewKey(prev => ({
      ...prev,
      zones: prev.zones.filter(zone => zone !== zoneToRemove)
    }));
  };

  const handleSaveKey = () => {
    try {
      if (!newKey.name || !newKey.algorithm || !newKey.server) {
        throw new Error('Name, algorithm, and server are required');
      }
      
      if (!editingKey && !newKey.secret) {
        throw new Error('Secret is required for new keys');
      }
      
      const keyWithTimestamp = {
        ...newKey,
        secret: editingKey && !newKey.secret ? editingKey.secret : newKey.secret,
        created: editingKey?.created || Date.now()
      };
      
      if (editingKey) {
        updateKey(editingKey.id, keyWithTimestamp);
      } else {
        addKey(keyWithTimestamp);
      }
      
      setDialogOpen(false);
      setEditingKey(null);
      setNewKey({
        name: '',
        algorithm: 'hmac-sha256',
        secret: '',
        server: '',
        zones: [],
        created: null
      });
      setZoneInput('');
      setZoneSearchText('');
      setError(null);

      setTimeout(() => {
        const event = new CustomEvent('keyDataChanged', {
          detail: {
            type: editingKey ? 'UPDATE' : 'ADD',
            key: keyWithTimestamp
          }
        });
        window.dispatchEvent(event);
      }, 100);

    } catch (err) {
      setError(err.message);
    }
  };

  const getFilteredZones = (zones) => {
    if (!zoneSearchText) return zones;
    const searchLower = zoneSearchText.toLowerCase();
    return zones.filter(zone => zone.toLowerCase().includes(searchLower));
  };

  const renderZonesList = (zones) => {
    const filteredZones = getFilteredZones(zones);
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Managed Zones
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            label="Add Zone"
            value={zoneInput}
            onChange={(e) => setZoneInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddZone();
              }
            }}
            sx={{ flexGrow: 1 }}
          />
          <Button 
            variant="outlined" 
            onClick={handleAddZone}
            disabled={!zoneInput.trim()}
          >
            Add
          </Button>
        </Box>

        {newKey.zones.length > 0 && (
          <TextField
            size="small"
            fullWidth
            placeholder="Search zones..."
            value={zoneSearchText}
            onChange={(e) => setZoneSearchText(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1 }}
          />
        )}

        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 1,
            maxHeight: '200px',
            overflowY: 'auto',
            p: 1,
            bgcolor: 'background.default',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider'
          }}
        >
          {filteredZones.length > 0 ? (
            filteredZones.map((zone) => (
              <Chip
                key={zone}
                label={zone}
                onDelete={() => handleRemoveZone(zone)}
                size="small"
                sx={{ 
                  width: 'fit-content',
                  maxWidth: '100%',
                  '.MuiChip-label': {
                    whiteSpace: 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }
                }}
              />
            ))
          ) : (
            <Typography 
              color="text.secondary" 
              sx={{ 
                gridColumn: '1 / -1',
                textAlign: 'center',
                py: 2 
              }}
            >
              {newKey.zones.length === 0 
                ? 'No zones added yet' 
                : 'No zones match your search'}
            </Typography>
          )}
        </Box>
        
        {newKey.zones.length > 0 && (
          <Typography 
            variant="caption" 
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            {newKey.zones.length} zone{newKey.zones.length !== 1 ? 's' : ''} managed
            {zoneSearchText && ` • ${filteredZones.length} matching filter`}
          </Typography>
        )}
      </Box>
    );
  };

  const renderKeyZones = (zones) => {
    if (!zones?.length) return null;

    return (
      <Box sx={{ width: '100%' }}>
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ mb: 0.5 }}
        >
          Managed Zones ({zones.length}):
        </Typography>
        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 1,
            maxHeight: zones.length > 6 ? '120px' : 'auto',
            overflowY: zones.length > 6 ? 'auto' : 'visible',
            p: 1,
            bgcolor: 'background.default',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider'
          }}
        >
          {zones.map((zone) => (
            <Chip
              key={zone}
              label={zone}
              size="small"
              variant="outlined"
              sx={{ 
                width: 'fit-content',
                maxWidth: '100%',
                '.MuiChip-label': {
                  whiteSpace: 'normal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }
              }}
            />
          ))}
        </Box>
      </Box>
    );
  };

  const addKey = (newKey) => {
    try {
      const currentConfig = { ...config };
      const keyWithId = {
        ...newKey,
        id: `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      currentConfig.keys = [...(currentConfig.keys || []), keyWithId];
      updateConfig(currentConfig);
      return keyWithId;
    } catch (error) {
      setError(`Failed to add key: ${error.message}`);
      throw error;
    }
  };

  const updateKey = (keyId, updatedKey) => {
    try {
      const currentConfig = { ...config };
      const keyIndex = currentConfig.keys?.findIndex(k => k.id === keyId);
      
      if (keyIndex === -1 || keyIndex === undefined) {
        throw new Error('Key not found');
      }

      currentConfig.keys[keyIndex] = {
        ...currentConfig.keys[keyIndex],
        ...updatedKey,
        id: keyId // Ensure ID remains unchanged
      };

      updateConfig(currentConfig);
    } catch (error) {
      setError(`Failed to update key: ${error.message}`);
      throw error;
    }
  };

  const removeKey = (keyId) => {
    try {
      const currentConfig = { ...config };
      currentConfig.keys = currentConfig.keys?.filter(k => k.id !== keyId) || [];
      updateConfig(currentConfig);
    } catch (error) {
      setError(`Failed to remove key: ${error.message}`);
    }
  };

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" component="h2">
          TSIG Keys
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Key
        </Button>
      </Box>

      <List>
        {(keys || []).map((key) => (
          <ListItem
            key={key.id}
            secondaryAction={
              <Box>
                <Tooltip title="Edit Key">
                  <IconButton edge="end" onClick={() => handleOpenDialog(key)} sx={{ mr: 1 }}>
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete Key">
                  <IconButton edge="end" onClick={() => removeKey(key.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            }
            sx={{ 
              flexDirection: 'column', 
              alignItems: 'flex-start',
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Box sx={{ width: '100%', mb: 1 }}>
              <Typography variant="subtitle1" component="div">
                {key.name}
              </Typography>
              <Typography 
                variant="body2" 
                color="text.secondary"
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <span>{key.algorithm}</span>
                <span>•</span>
                <span>{key.server}</span>
                {key.created && (
                  <>
                    <span>•</span>
                    <span>Created: {new Date(key.created).toLocaleDateString()}</span>
                  </>
                )}
              </Typography>
            </Box>
            
            {renderKeyZones(key.zones)}
          </ListItem>
        ))}
      </List>

      {(!keys || keys.length === 0) && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          No TSIG keys configured
        </Typography>
      )}

      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingKey ? 'Edit TSIG Key' : 'Add TSIG Key'}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Key Name"
            fullWidth
            value={newKey.name}
            onChange={(e) => setNewKey(prev => ({ ...prev, name: e.target.value }))}
          />
          <TextField
            margin="dense"
            label="DNS Server"
            fullWidth
            value={newKey.server}
            onChange={(e) => setNewKey(prev => ({ ...prev, server: e.target.value }))}
            helperText="DNS server hostname or IP address"
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Algorithm</InputLabel>
            <Select
              value={newKey.algorithm}
              onChange={(e) => setNewKey(prev => ({ ...prev, algorithm: e.target.value }))}
              label="Algorithm"
            >
              <MenuItem value="hmac-md5">HMAC-MD5</MenuItem>
              <MenuItem value="hmac-sha1">HMAC-SHA1</MenuItem>
              <MenuItem value="hmac-sha256">HMAC-SHA256</MenuItem>
              <MenuItem value="hmac-sha512">HMAC-SHA512</MenuItem>
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            label="Secret"
            fullWidth
            value={newKey.secret}
            onChange={(e) => setNewKey(prev => ({ ...prev, secret: e.target.value }))}
            helperText="Base64 encoded key"
          />
          
          {renderZonesList(newKey.zones)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveKey} variant="contained">
            {editingKey ? 'Save Changes' : 'Add Key'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default KeyManagement; 