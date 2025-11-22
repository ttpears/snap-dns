// src/components/TSIGKeyManagement.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyIcon from '@mui/icons-material/Key';
import { tsigKeyService, TSIGKey, TSIGKeyCreate } from '../services/tsigKeyService';
import { useAuth } from '../context/AuthContext';

export default function TSIGKeyManagement() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<TSIGKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<TSIGKey | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<TSIGKey | null>(null);

  // Form state
  const [formData, setFormData] = useState<TSIGKeyCreate>({
    name: '',
    server: '',
    keyName: '',
    keyValue: '',
    algorithm: 'hmac-sha256',
    zones: [],
  });
  const [zoneInput, setZoneInput] = useState('');

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await tsigKeyService.listKeys();
      setKeys(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load TSIG keys');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (key?: TSIGKey) => {
    if (key) {
      setEditingKey(key);
      setFormData({
        name: key.name,
        server: key.server,
        keyName: key.keyName,
        keyValue: '', // Don't populate for security
        algorithm: key.algorithm,
        zones: key.zones,
      });
    } else {
      setEditingKey(null);
      setFormData({
        name: '',
        server: '',
        keyName: '',
        keyValue: '',
        algorithm: 'hmac-sha256',
        zones: [],
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingKey(null);
    setFormData({
      name: '',
      server: '',
      keyName: '',
      keyValue: '',
      algorithm: 'hmac-sha256',
      zones: [],
    });
    setZoneInput('');
  };

  const handleAddZone = () => {
    const zones = formData.zones || [];
    if (zoneInput.trim() && !zones.includes(zoneInput.trim())) {
      setFormData({
        ...formData,
        zones: [...zones, zoneInput.trim()],
      });
      setZoneInput('');
    }
  };

  const handleRemoveZone = (zone: string) => {
    setFormData({
      ...formData,
      zones: (formData.zones || []).filter(z => z !== zone),
    });
  };

  const handleSubmit = async () => {
    try {
      setError('');
      setSuccess('');

      // Validate required fields
      if (!formData.name || !formData.server || !formData.keyName || !formData.algorithm) {
        setError('Please fill in all required fields');
        return;
      }

      if (!editingKey && !formData.keyValue) {
        setError('Key value is required when creating a new key');
        return;
      }

      if (editingKey) {
        // Update existing key
        const updates: Partial<TSIGKeyCreate> = {
          name: formData.name,
          server: formData.server,
          keyName: formData.keyName,
          algorithm: formData.algorithm,
          zones: formData.zones,
        };
        // Only include keyValue if it was changed
        if (formData.keyValue) {
          updates.keyValue = formData.keyValue;
        }
        await tsigKeyService.updateKey(editingKey.id, updates);
        setSuccess('Key updated successfully');
      } else {
        // Create new key
        await tsigKeyService.createKey(formData);
        setSuccess('Key created successfully');
      }

      handleCloseDialog();
      loadKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to save key');
    }
  };

  const handleDelete = async () => {
    if (!keyToDelete) return;

    try {
      setError('');
      setSuccess('');
      await tsigKeyService.deleteKey(keyToDelete.id);
      setSuccess('Key deleted successfully');
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
      loadKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to delete key');
    }
  };

  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const canDelete = user?.role === 'admin';

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <KeyIcon />
          <Typography variant="h6">TSIG Keys</Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Key
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        TSIG keys are stored server-side and encrypted at rest. Keys are automatically used
        when accessing zones they're assigned to.
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Server</TableCell>
              <TableCell>Key Name</TableCell>
              <TableCell>Algorithm</TableCell>
              <TableCell>Zones</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" py={2}>
                    No TSIG keys configured. Add a key to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell>{key.server}</TableCell>
                  <TableCell>{key.keyName}</TableCell>
                  <TableCell>
                    <Chip label={key.algorithm} size="small" />
                  </TableCell>
                  <TableCell>
                    {key.zones.length === 0 ? (
                      <Chip label="All zones" size="small" color="default" />
                    ) : (
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {key.zones.map((zone) => (
                          <Chip key={zone} label={zone} size="small" />
                        ))}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(key)}
                        title="Edit key"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    {canDelete && (
                      <IconButton
                        size="small"
                        onClick={() => {
                          setKeyToDelete(key);
                          setDeleteDialogOpen(true);
                        }}
                        title="Delete key"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingKey ? 'Edit TSIG Key' : 'Add TSIG Key'}
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Key Name (Display Name)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
              helperText="Friendly name for this key"
            />

            <TextField
              label="DNS Server"
              value={formData.server}
              onChange={(e) => setFormData({ ...formData, server: e.target.value })}
              required
              fullWidth
              placeholder="ns1.example.com"
              helperText="The DNS server hostname or IP address"
            />

            <TextField
              label="TSIG Key Name"
              value={formData.keyName}
              onChange={(e) => setFormData({ ...formData, keyName: e.target.value })}
              required
              fullWidth
              helperText="The name of the TSIG key on the DNS server"
            />

            <TextField
              label="Key Value (Base64)"
              value={formData.keyValue}
              onChange={(e) => setFormData({ ...formData, keyValue: e.target.value })}
              required={!editingKey}
              fullWidth
              type="password"
              helperText={
                editingKey
                  ? 'Leave blank to keep existing key value'
                  : 'The base64-encoded TSIG key secret'
              }
            />

            <FormControl fullWidth>
              <InputLabel>Algorithm</InputLabel>
              <Select
                value={formData.algorithm}
                onChange={(e) => setFormData({ ...formData, algorithm: e.target.value })}
                label="Algorithm"
              >
                <MenuItem value="hmac-md5">HMAC-MD5</MenuItem>
                <MenuItem value="hmac-sha1">HMAC-SHA1</MenuItem>
                <MenuItem value="hmac-sha256">HMAC-SHA256</MenuItem>
                <MenuItem value="hmac-sha512">HMAC-SHA512</MenuItem>
              </Select>
            </FormControl>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Zones (leave empty for all zones)
              </Typography>
              <Box display="flex" gap={1} mb={1}>
                <TextField
                  size="small"
                  placeholder="example.com"
                  value={zoneInput}
                  onChange={(e) => setZoneInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddZone()}
                  fullWidth
                />
                <Button onClick={handleAddZone} variant="outlined">
                  Add
                </Button>
              </Box>
              <Box display="flex" gap={0.5} flexWrap="wrap">
                {(formData.zones || []).map((zone) => (
                  <Chip
                    key={zone}
                    label={zone}
                    onDelete={() => handleRemoveZone(zone)}
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingKey ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete TSIG Key</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the key "{keyToDelete?.name}"? This action cannot
            be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
