import React, { useState } from 'react';
import {
  Paper,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Box,
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { useConfig } from '../context/ConfigContext';

const SUPPORTED_ALGORITHMS = {
  'hmac-sha512': 'HMAC-SHA512',
  'hmac-sha384': 'HMAC-SHA384',
  'hmac-sha256': 'HMAC-SHA256',
  'hmac-sha224': 'HMAC-SHA224',
  'hmac-sha1': 'HMAC-SHA1',
  'hmac-md5': 'HMAC-MD5'
};

function Settings() {
  const { config, updateConfig, purgeConfig } = useConfig();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [newZone, setNewZone] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [addZoneDialogOpen, setAddZoneDialogOpen] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleAddZone = () => {
    if (!newZone || !selectedKeyId) return;

    const updatedKeys = config.keys.map(key => {
      if (key.id === selectedKeyId) {
        return {
          ...key,
          zones: [...key.zones, newZone]
        };
      }
      return key;
    });

    updateConfig({
      keys: updatedKeys,
      savedZones: [...config.savedZones, { name: newZone, lastUpdated: new Date().toISOString() }]
    });

    setNewZone('');
    setAddZoneDialogOpen(false);
  };

  const handleRemoveZone = (keyId, zoneName) => {
    const updatedKeys = config.keys.map(key => {
      if (key.id === keyId) {
        return {
          ...key,
          zones: key.zones.filter(z => z !== zoneName)
        };
      }
      return key;
    });

    // Only remove from savedZones if no other key uses it
    const zoneStillUsed = updatedKeys.some(key => key.zones.includes(zoneName));
    const updatedSavedZones = zoneStillUsed 
      ? config.savedZones 
      : config.savedZones.filter(z => z.name !== zoneName);

    updateConfig({
      keys: updatedKeys,
      savedZones: updatedSavedZones
    });
  };

  const handleUpdateKey = (keyId, field, value) => {
    const updatedKeys = config.keys.map(key => {
      if (key.id === keyId) {
        return {
          ...key,
          [field]: value
        };
      }
      return key;
    });
    updateConfig({ keys: updatedKeys });
  };

  return (
    <>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          General Settings
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={config.darkMode}
              onChange={(e) => updateConfig({ darkMode: e.target.checked })}
            />
          }
          label="Dark Mode"
        />
        <TextField
          fullWidth
          type="number"
          label="Default TTL"
          value={config.defaultTTL}
          onChange={(e) => updateConfig({ defaultTTL: parseInt(e.target.value) })}
          sx={{ mt: 2 }}
        />
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          DNS Keys and Zones
        </Typography>

        {config.keys.map(key => (
          <Accordion key={key.id} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>{key.name}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  fullWidth
                  label="DNS Server"
                  value={key.server}
                  onChange={(e) => handleUpdateKey(key.id, 'server', e.target.value)}
                />
                <TextField
                  fullWidth
                  label="Key Name"
                  value={key.keyName}
                  onChange={(e) => handleUpdateKey(key.id, 'keyName', e.target.value)}
                />
                <TextField
                  fullWidth
                  label="Key Value"
                  type="password"
                  value={key.keyValue}
                  onChange={(e) => handleUpdateKey(key.id, 'keyValue', e.target.value)}
                />
                <TextField
                  select
                  fullWidth
                  label="Algorithm"
                  value={key.algorithm}
                  onChange={(e) => handleUpdateKey(key.id, 'algorithm', e.target.value)}
                  SelectProps={{ native: true }}
                >
                  {Object.entries(SUPPORTED_ALGORITHMS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </TextField>

                <Divider sx={{ my: 2 }} />
                
                <Typography variant="subtitle1">
                  Managed Zones
                  <IconButton 
                    size="small" 
                    onClick={() => {
                      setSelectedKeyId(key.id);
                      setAddZoneDialogOpen(true);
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                </Typography>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {key.zones.map(zone => (
                    <Chip
                      key={zone}
                      label={zone}
                      onDelete={() => handleRemoveZone(key.id, zone)}
                    />
                  ))}
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom color="error">
          Danger Zone
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<WarningIcon />}
          onClick={() => setConfirmPurge(true)}
        >
          Purge Local Configuration
        </Button>
      </Paper>

      {/* Add Zone Dialog */}
      <Dialog open={addZoneDialogOpen} onClose={() => setAddZoneDialogOpen(false)}>
        <DialogTitle>Add Zone</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Zone Name"
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
            placeholder="example.com"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddZoneDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddZone} variant="contained">
            Add Zone
          </Button>
        </DialogActions>
      </Dialog>

      {/* Purge Confirmation Dialog */}
      <Dialog open={confirmPurge} onClose={() => setConfirmPurge(false)}>
        <DialogTitle>Confirm Configuration Purge</DialogTitle>
        <DialogContent>
          <Typography color="error">
            This will permanently delete all saved settings.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPurge(false)}>Cancel</Button>
          <Button 
            color="error" 
            onClick={() => {
              purgeConfig();
              setConfirmPurge(false);
            }}
          >
            Purge Configuration
          </Button>
        </DialogActions>
      </Dialog>

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Settings saved successfully
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </>
  );
}

export default Settings;