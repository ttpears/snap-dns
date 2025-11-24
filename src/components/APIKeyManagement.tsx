// src/components/APIKeyManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Checkbox,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
  Tooltip,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { useNotification } from '../context/NotificationContext';
import { ApiKeyResponse, ApiKeyScope, ApiKeyCreateData } from '../types/apiKey';
import * as apiKeyService from '../services/apiKeyService';

export const APIKeyManagement: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyDisplayDialogOpen, setKeyDisplayDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKeyResponse | null>(null);
  const [displayedKey, setDisplayedKey] = useState<string>('');
  const [showKey, setShowKey] = useState(false);
  const { showNotification } = useNotification();

  // Form state
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([ApiKeyScope.READ, ApiKeyScope.WRITE]);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');

  // Load API keys
  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedKeys = await apiKeyService.listApiKeys();
      setKeys(fetchedKeys);
    } catch (error: any) {
      showNotification('Failed to load API keys: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Handle create API key
  const handleCreate = async () => {
    if (!name.trim()) {
      showNotification('Please enter a name for the API key', 'error');
      return;
    }

    if (selectedScopes.length === 0) {
      showNotification('Please select at least one scope', 'error');
      return;
    }

    try {
      const data: ApiKeyCreateData = {
        name: name.trim(),
        scopes: selectedScopes,
        expiresInDays: expiresInDays !== '' ? expiresInDays : undefined
      };

      const result = await apiKeyService.createApiKey(data);

      // Show the key to the user (only time it's visible)
      setDisplayedKey(result.key);
      setShowKey(false);
      setKeyDisplayDialogOpen(true);

      // Reload keys
      await loadKeys();

      // Reset form
      setCreateDialogOpen(false);
      setName('');
      setSelectedScopes([ApiKeyScope.READ, ApiKeyScope.WRITE]);
      setExpiresInDays('');

      showNotification('API key created successfully', 'success');
    } catch (error: any) {
      showNotification('Failed to create API key: ' + error.message, 'error');
    }
  };

  // Handle delete API key
  const handleDelete = async () => {
    if (!selectedKey) return;

    try {
      await apiKeyService.deleteApiKey(selectedKey.id);
      await loadKeys();
      setDeleteDialogOpen(false);
      setSelectedKey(null);
      showNotification('API key deleted successfully', 'success');
    } catch (error: any) {
      showNotification('Failed to delete API key: ' + error.message, 'error');
    }
  };

  // Handle rotate API key
  const handleRotate = async () => {
    if (!selectedKey) return;

    try {
      const result = await apiKeyService.rotateApiKey(selectedKey.id);

      // Show the new key to the user
      setDisplayedKey(result.key);
      setShowKey(false);
      setKeyDisplayDialogOpen(true);

      // Reload keys
      await loadKeys();

      setRotateDialogOpen(false);
      setSelectedKey(null);

      showNotification('API key rotated successfully', 'success');
    } catch (error: any) {
      showNotification('Failed to rotate API key: ' + error.message, 'error');
    }
  };

  // Copy key to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(displayedKey);
    showNotification('API key copied to clipboard', 'success');
  };

  // Format date for display
  const formatDate = (date?: Date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  // Check if key is expired
  const isExpired = (key: ApiKeyResponse) => {
    return key.expiresAt && new Date(key.expiresAt) < new Date();
  };

  // Toggle scope selection
  const toggleScope = (scope: ApiKeyScope) => {
    setSelectedScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    );
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">API Keys</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create API Key
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        API keys allow programmatic access to the DNS API. Keep your keys secure and never share them publicly.
      </Alert>

      {loading ? (
        <Typography>Loading...</Typography>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center">
              No API keys found. Create one to access the API programmatically.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Key Preview</TableCell>
                <TableCell>Scopes</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell>Expires</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id} sx={{ opacity: isExpired(key) ? 0.5 : 1 }}>
                  <TableCell>
                    {key.name}
                    {isExpired(key) && (
                      <Chip label="Expired" color="error" size="small" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <code style={{ fontSize: '0.875rem' }}>{key.keyPreview}</code>
                  </TableCell>
                  <TableCell>
                    {key.scopes.map((scope) => (
                      <Chip
                        key={scope}
                        label={scope.toUpperCase()}
                        size="small"
                        sx={{ mr: 0.5 }}
                        color={scope === ApiKeyScope.ADMIN ? 'error' : scope === ApiKeyScope.WRITE ? 'warning' : 'default'}
                      />
                    ))}
                  </TableCell>
                  <TableCell>{formatDate(key.createdAt)}</TableCell>
                  <TableCell>{formatDate(key.lastUsedAt)}</TableCell>
                  <TableCell>{formatDate(key.expiresAt)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Rotate Key">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedKey(key);
                          setRotateDialogOpen(true);
                        }}
                      >
                        <RefreshIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Key">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          setSelectedKey(key);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="A descriptive name for this API key"
          />

          <FormControl component="fieldset" sx={{ mt: 2 }}>
            <FormLabel component="legend">Scopes</FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedScopes.includes(ApiKeyScope.READ)}
                    onChange={() => toggleScope(ApiKeyScope.READ)}
                  />
                }
                label="Read - View zones and records"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedScopes.includes(ApiKeyScope.WRITE)}
                    onChange={() => toggleScope(ApiKeyScope.WRITE)}
                  />
                }
                label="Write - Modify DNS records"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedScopes.includes(ApiKeyScope.ADMIN)}
                    onChange={() => toggleScope(ApiKeyScope.ADMIN)}
                  />
                }
                label="Admin - Manage keys, users, and settings"
              />
            </FormGroup>
          </FormControl>

          <FormControl fullWidth sx={{ mt: 2 }}>
            <FormLabel>Expiration</FormLabel>
            <Select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value as number | '')}
            >
              <MenuItem value="">Never</MenuItem>
              <MenuItem value={7}>7 days</MenuItem>
              <MenuItem value={30}>30 days</MenuItem>
              <MenuItem value={90}>90 days</MenuItem>
              <MenuItem value={365}>1 year</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Key Display Dialog */}
      <Dialog open={keyDisplayDialogOpen} onClose={() => setKeyDisplayDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>API Key Created</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This is the only time you'll see this key. Please save it securely now!
          </Alert>

          <TextField
            fullWidth
            label="API Key"
            value={displayedKey}
            type={showKey ? 'text' : 'password'}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowKey(!showKey)} edge="end">
                    {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                  <IconButton onClick={copyToClipboard} edge="end">
                    <CopyIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Use this key in your API requests by adding the Authorization header:
          </Typography>
          <Paper sx={{ p: 1, mt: 1, bgcolor: 'grey.100' }}>
            <code style={{ fontSize: '0.75rem' }}>
              Authorization: Bearer {displayedKey.substring(0, 16)}...
            </code>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKeyDisplayDialogOpen(false)} variant="contained">
            I've Saved My Key
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete API Key</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the API key "{selectedKey?.name}"?
            This action cannot be undone and will immediately revoke access for this key.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Rotate Confirmation Dialog */}
      <Dialog open={rotateDialogOpen} onClose={() => setRotateDialogOpen(false)}>
        <DialogTitle>Rotate API Key</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to rotate the API key "{selectedKey?.name}"?
            This will generate a new key value and invalidate the old one.
            You'll need to update any applications using this key.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRotateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRotate} color="warning" variant="contained">Rotate</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
