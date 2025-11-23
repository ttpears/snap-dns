// src/components/UserManagement.tsx
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Chip,
  CircularProgress,
  FormHelperText,
  Checkbox,
  FormGroup,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import { userService, UserResponse, UserCreateData } from '../services/userService';
import { tsigKeyService, TSIGKey } from '../services/tsigKeyService';

const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full access to all features' },
  { value: 'editor', label: 'Editor', description: 'Can manage DNS records' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
];

function UserManagement() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [keys, setKeys] = useState<TSIGKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // Form states
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const [formData, setFormData] = useState<UserCreateData>({
    username: '',
    password: '',
    role: 'viewer',
    email: '',
    allowedKeyIds: [],
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, keysData] = await Promise.all([
        userService.listUsers(),
        tsigKeyService.listKeys(),
      ]);
      setUsers(usersData);
      setKeys(keysData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    try {
      if (!formData.username || !formData.password) {
        setError('Username and password are required');
        return;
      }

      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      await userService.createUser(formData);
      setSuccess('User created successfully');
      setAddDialogOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      // Update role if changed
      if (selectedUser.role !== formData.role) {
        await userService.updateUserRole(selectedUser.id, formData.role);
      }

      // Update keys
      await userService.updateUserKeys(selectedUser.id, formData.allowedKeyIds || []);

      setSuccess('User updated successfully');
      setEditDialogOpen(false);
      setSelectedUser(null);
      resetForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await userService.deleteUser(selectedUser.id);
      setSuccess('User deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;

    try {
      if (!newPassword || newPassword.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      await userService.resetPassword(selectedUser.id, newPassword);
      setSuccess('Password reset successfully');
      setPasswordDialogOpen(false);
      setSelectedUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  const openAddDialog = () => {
    resetForm();
    setAddDialogOpen(true);
  };

  const openEditDialog = (user: UserResponse) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      email: user.email || '',
      allowedKeyIds: user.allowedKeyIds || [],
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (user: UserResponse) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const openPasswordDialog = (user: UserResponse) => {
    setSelectedUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      role: 'viewer',
      email: '',
      allowedKeyIds: [],
    });
  };

  const handleKeyToggle = (keyId: string) => {
    const currentKeys = formData.allowedKeyIds || [];
    const newKeys = currentKeys.includes(keyId)
      ? currentKeys.filter(id => id !== keyId)
      : [...currentKeys, keyId];
    setFormData({ ...formData, allowedKeyIds: newKeys });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'error';
      case 'editor': return 'primary';
      case 'viewer': return 'default';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">User Management</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
        >
          Add User
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Allowed Keys</TableCell>
              <TableCell>Last Login</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={user.role.toUpperCase()}
                    color={getRoleBadgeColor(user.role)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {user.role === 'admin' ? (
                    <Chip label="All Keys" size="small" color="success" />
                  ) : user.allowedKeyIds.length === 0 ? (
                    <Chip label="No Keys" size="small" />
                  ) : (
                    <Chip label={`${user.allowedKeyIds.length} keys`} size="small" />
                  )}
                </TableCell>
                <TableCell>
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => openEditDialog(user)}
                    title="Edit user"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => openPasswordDialog(user)}
                    title="Reset password"
                  >
                    <LockResetIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => openDeleteDialog(user)}
                    title="Delete user"
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Username"
            fullWidth
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
          <TextField
            margin="dense"
            label="Email"
            type="email"
            fullWidth
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            helperText="Minimum 8 characters"
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Role</InputLabel>
            <Select
              value={formData.role}
              label="Role"
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            >
              {ROLES.map((role) => (
                <MenuItem key={role.value} value={role.value}>
                  {role.label} - {role.description}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {formData.role !== 'admin' && (
            <Box mt={2}>
              <Typography variant="subtitle2" gutterBottom>
                Allowed Keys
              </Typography>
              <FormGroup>
                {keys.map((key) => (
                  <FormControlLabel
                    key={key.id}
                    control={
                      <Checkbox
                        checked={(formData.allowedKeyIds || []).includes(key.id)}
                        onChange={() => handleKeyToggle(key.id)}
                      />
                    }
                    label={`${key.name} (${key.server})`}
                  />
                ))}
              </FormGroup>
              <FormHelperText>Admin users have access to all keys</FormHelperText>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddUser} variant="contained">
            Add User
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Username"
            fullWidth
            value={formData.username}
            disabled
            helperText="Username cannot be changed"
          />
          <FormControl fullWidth margin="dense">
            <InputLabel>Role</InputLabel>
            <Select
              value={formData.role}
              label="Role"
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            >
              {ROLES.map((role) => (
                <MenuItem key={role.value} value={role.value}>
                  {role.label} - {role.description}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {formData.role !== 'admin' && (
            <Box mt={2}>
              <Typography variant="subtitle2" gutterBottom>
                Allowed Keys
              </Typography>
              <FormGroup>
                {keys.map((key) => (
                  <FormControlLabel
                    key={key.id}
                    control={
                      <Checkbox
                        checked={(formData.allowedKeyIds || []).includes(key.id)}
                        onChange={() => handleKeyToggle(key.id)}
                      />
                    }
                    label={`${key.name} (${key.server})`}
                  />
                ))}
              </FormGroup>
              <FormHelperText>Admin users have access to all keys</FormHelperText>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleEditUser} variant="contained">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete user <strong>{selectedUser?.username}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteUser} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Reset password for <strong>{selectedUser?.username}</strong>
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="New Password"
            type="password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Minimum 8 characters"
          />
          <TextField
            margin="dense"
            label="Confirm Password"
            type="password"
            fullWidth
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleResetPassword} variant="contained">
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserManagement;
