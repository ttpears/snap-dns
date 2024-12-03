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
  Tooltip
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon } from '@mui/icons-material';
import { useKey } from '../context/KeyContext';

function KeyManagement() {
  const { keys, addKey, removeKey, updateKey } = useKey();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [newKey, setNewKey] = useState({
    name: '',
    algorithm: 'hmac-sha256',
    secret: '',
    zones: []
  });
  const [zoneInput, setZoneInput] = useState('');
  const [error, setError] = useState(null);

  const handleOpenDialog = (key = null) => {
    if (key) {
      setEditingKey(key);
      setNewKey({ ...key });
    } else {
      setEditingKey(null);
      setNewKey({
        name: '',
        algorithm: 'hmac-sha256',
        secret: '',
        zones: []
      });
    }
    setDialogOpen(true);
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
      if (!newKey.name || !newKey.algorithm || !newKey.secret) {
        throw new Error('All fields are required');
      }
      
      const keyWithTimestamp = {
        ...newKey,
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
        zones: []
      });
      setError(null);
    } catch (err) {
      setError(err.message);
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
        {keys.map((key) => (
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
          >
            <ListItemText
              primary={key.name}
              secondary={
                <Box component="span" sx={{ display: 'block' }}>
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    component="span"
                  >
                    {key.algorithm}
                    {key.created && ` • Created: ${new Date(key.created).toLocaleDateString()}`}
                  </Typography>
                  <Box component="span" sx={{ display: 'block', mt: 1 }}>
                    <Stack 
                      direction="row" 
                      spacing={1} 
                      component="span" 
                      sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 1 }}
                    >
                      {key.zones.map((zone) => (
                        <Chip
                          key={zone}
                          label={zone}
                          size="small"
                          color="primary"
                          variant="outlined"
                          component="span"
                        />
                      ))}
                    </Stack>
                  </Box>
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>

      {keys.length === 0 && (
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
              />
              <Button 
                variant="outlined" 
                onClick={handleAddZone}
                disabled={!zoneInput.trim()}
              >
                Add
              </Button>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {newKey.zones.map((zone) => (
                <Chip
                  key={zone}
                  label={zone}
                  onDelete={() => handleRemoveZone(zone)}
                  size="small"
                />
              ))}
            </Stack>
          </Box>
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