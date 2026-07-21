// src/components/TokenManagement.tsx
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
import DeleteIcon from '@mui/icons-material/Delete';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { tokenService, ApiToken } from '../services/tokenService';
import { useNotification } from '../context/NotificationContext';

// Expiry choices offered in the create dialog. A value of 0 means "Never"
// and is translated to `undefined` (no expiry) when calling the API.
const EXPIRY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'Never', value: 0 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
];

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export default function TokenManagement() {
  const { showSuccess, showError } = useNotification();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(0);
  const [creating, setCreating] = useState(false);
  // The raw token is only ever held in memory for the reveal-once view.
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  // Revoke dialog state
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState<ApiToken | null>(null);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await tokenService.listTokens();
      setTokens(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load API tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setName('');
    setExpiresInDays(0);
    setFormError('');
    setCreatedToken(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setFormError('');
    setName('');
    setExpiresInDays(0);
    // Clear any revealed token so it never lingers in memory.
    setCreatedToken(null);
    loadTokens();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('Token name is required');
      return;
    }
    try {
      setFormError('');
      setCreating(true);
      const result = await tokenService.createToken(
        name.trim(),
        expiresInDays > 0 ? expiresInDays : undefined
      );
      setCreatedToken(result.token);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      showSuccess('Copied to clipboard');
    } catch (err: any) {
      showError('Failed to copy to clipboard');
    }
  };

  const handleRevoke = async () => {
    if (!tokenToRevoke) return;
    try {
      await tokenService.revokeToken(tokenToRevoke.id);
      showSuccess('Token revoked');
      setRevokeDialogOpen(false);
      setTokenToRevoke(null);
      loadTokens();
    } catch (err: any) {
      showError(err.message || 'Failed to revoke token');
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3} role="status">
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <VpnKeyIcon />
          <Typography variant="h6">API Tokens</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenDialog}
        >
          Create Token
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        API tokens grant programmatic access with your current permissions. Treat them like
        passwords.
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Prefix</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Last Used</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" py={2}>
                    No API tokens yet. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>{token.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={token.prefix}
                      size="small"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  </TableCell>
                  <TableCell>{formatDate(token.createdAt)}</TableCell>
                  <TableCell>{formatDate(token.lastUsedAt)}</TableCell>
                  <TableCell>{formatDate(token.expiresAt)}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setTokenToRevoke(token);
                        setRevokeDialogOpen(true);
                      }}
                      title="Revoke token"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {createdToken ? 'Token Created' : 'Create API Token'}
        </DialogTitle>
        <DialogContent>
          {createdToken ? (
            // Reveal-once view: the raw token is shown a single time.
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              <Alert severity="warning">
                Copy this token now. You will not be able to see it again.
              </Alert>
              <Box display="flex" alignItems="center" gap={1}>
                <TextField
                  label="API Token"
                  value={createdToken}
                  fullWidth
                  InputProps={{
                    readOnly: true,
                    sx: { fontFamily: 'monospace' },
                  }}
                />
                <IconButton onClick={handleCopy} title="Copy token">
                  <ContentCopyIcon />
                </IconButton>
              </Box>
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={2} mt={1}>
              {formError && (
                <Alert severity="error" onClose={() => setFormError('')}>
                  {formError}
                </Alert>
              )}
              <TextField
                label="Token Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
                autoFocus
                helperText="A friendly name to identify this token"
              />
              <FormControl fullWidth>
                <InputLabel id="token-expiry-label">Expiration</InputLabel>
                <Select
                  labelId="token-expiry-label"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  label="Expiration"
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {createdToken ? (
            <Button onClick={handleCloseDialog} variant="contained">
              Done
            </Button>
          ) : (
            <>
              <Button onClick={handleCloseDialog}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                variant="contained"
                disabled={creating}
                startIcon={creating ? <CircularProgress size={20} /> : undefined}
              >
                Create
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog open={revokeDialogOpen} onClose={() => setRevokeDialogOpen(false)}>
        <DialogTitle>Revoke Token</DialogTitle>
        <DialogContent>
          <Typography>
            Revoke token "{tokenToRevoke?.name}"? Any client using it will immediately lose
            access. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRevoke} color="error" variant="contained">
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
