import React, { useState } from 'react';
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  IconButton
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { usePendingChanges } from '../context/PendingChangesContext';
import { dnsService } from '../services/dnsService';

function PendingChanges() {
  const { pendingChanges, removeChange, clearChanges } = usePendingChanges();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState(null);

  const handleApplyChanges = async () => {
    try {
      const commands = [
        `server ${process.env.REACT_APP_DEFAULT_RESOLVER}`,
        ...pendingChanges.map(change => change.command),
        'send'
      ];

      await dnsService.executeNSUpdate(commands);
      clearChanges();
      setConfirmOpen(false);
    } catch (error) {
      setError('Failed to apply changes. Please try again.');
    }
  };

  return (
    <>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Pending Changes
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {pendingChanges.length === 0 ? (
          <Typography color="textSecondary">
            No pending changes
          </Typography>
        ) : (
          <>
            <List>
              {pendingChanges.map((change) => (
                <ListItem
                  key={change.id}
                  secondaryAction={
                    <IconButton 
                      edge="end" 
                      onClick={() => removeChange(change.id)}
                      aria-label="delete"
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={`${change.name}.${change.zone} ${change.type} ${change.value}`}
                    secondary={`TTL: ${change.ttl}`}
                  />
                </ListItem>
              ))}
            </List>

            <Button
              variant="contained"
              color="primary"
              onClick={() => setConfirmOpen(true)}
              sx={{ mt: 2 }}
              fullWidth
            >
              Apply Changes
            </Button>
          </>
        )}
      </Paper>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Confirm Changes</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to apply the following changes?
          </Typography>
          <List>
            {pendingChanges.map((change) => (
              <ListItem key={change.id}>
                <ListItemText
                  primary={`${change.name}.${change.zone} ${change.type} ${change.value}`}
                  secondary={`TTL: ${change.ttl}`}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleApplyChanges} color="primary">
            Apply Changes
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default PendingChanges; 