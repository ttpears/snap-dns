import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
  Stack,
  Collapse,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Edit as EditIcon,
  RestoreFromTrash as RestoreIcon,
  DragIndicator,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon
} from '@mui/icons-material';
import { dnsService } from '../services/dnsService';

function PendingChangesDrawer({ 
  open, 
  onClose,
  pendingChanges,
  setPendingChanges,
  removePendingChange,
  clearPendingChanges
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});

  const handleDragStart = (e, index) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggingIndex === null) return;

    const items = Array.from(pendingChanges);
    const draggedItem = items[draggingIndex];
    items.splice(draggingIndex, 1);
    items.splice(index, 0, draggedItem);

    setPendingChanges(items);
    setDraggingIndex(index);
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  const handleApplyChanges = async () => {
    setApplying(true);
    setError(null);

    try {
      // Group changes by zone
      const changesByZone = pendingChanges.reduce((acc, change) => {
        if (!acc[change.zone]) {
          acc[change.zone] = [];
        }
        acc[change.zone].push(change);
        return acc;
      }, {});

      // Apply changes zone by zone
      for (const [zone, changes] of Object.entries(changesByZone)) {
        // Get the key configuration from the first change
        const firstChange = changes[0];
        
        // Get the full key configuration from localStorage
        const config = JSON.parse(localStorage.getItem('dns_manager_config') || '{}');
        const keyConfig = config.keys.find(k => k.id === firstChange.keyId);
        
        if (!keyConfig) {
          throw new Error(`No key configuration found for ID: ${firstChange.keyId}`);
        }

        // Create backup before applying changes
        const backup = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          zone: zone,
          server: keyConfig.server,
          records: [], // Will be populated by current records
          type: 'auto',
          description: 'Automatic backup before changes',
          version: '1.0'
        };

        try {
          // Get current records for backup
          const currentRecords = await dnsService.fetchZoneRecords(zone, keyConfig);
          backup.records = currentRecords;

          // Save backup
          const backups = JSON.parse(localStorage.getItem('dnsBackups') || '[]');
          backups.unshift(backup);
          localStorage.setItem('dnsBackups', JSON.stringify(backups));

          // Apply changes in order
          for (const change of changes) {
            switch (change.type) {
              case 'ADD':
                await dnsService.addRecord(change.zone, change.record, keyConfig);
                break;
              case 'DELETE':
                await dnsService.deleteRecord(change.zone, change.record, keyConfig);
                break;
              case 'MODIFY':
                await dnsService.updateRecord(change.zone, change.originalRecord, change.newRecord, keyConfig);
                break;
              case 'RESTORE':
                await dnsService.addRecord(change.zone, change.record, keyConfig);
                break;
              default:
                console.warn(`Unknown change type: ${change.type}`);
            }
          }

          // Dispatch event to notify components that changes were applied
          window.dispatchEvent(new CustomEvent('dnsChangesApplied', {
            detail: { zones: [zone] }
          }));
        } catch (error) {
          console.error(`Failed to process changes for zone ${zone}:`, error);
          throw new Error(`Failed to process changes for zone ${zone}: ${error.message}`);
        }
      }

      clearPendingChanges();
      onClose();
    } catch (error) {
      console.error('Failed to apply changes:', error);
      setError(`Failed to apply changes: ${error.message}`);
    } finally {
      setApplying(false);
    }
  };

  const getChangeDescription = (change) => {
    if (!change || !change.type) {
      console.warn('Invalid change object:', change);
      return 'Unknown change';
    }

    try {
      switch (change.type) {
        case 'ADD':
          return change.record ? 
            `Add ${change.record.type} record "${change.record.name}" with value "${change.record.value}"` :
            'Add record';
        case 'DELETE':
          return change.record ? 
            `Delete ${change.record.type} record "${change.record.name}" with value "${change.record.value}"` :
            'Delete record';
        case 'MODIFY':
          if (!change.originalRecord || !change.newRecord) {
            return 'Modify record';
          }
          const changes = [];
          if (change.originalRecord.value !== change.newRecord.value) {
            changes.push(`value from "${change.originalRecord.value}" to "${change.newRecord.value}"`);
          }
          if (change.originalRecord.ttl !== change.newRecord.ttl) {
            changes.push(`TTL from ${change.originalRecord.ttl} to ${change.newRecord.ttl}`);
          }
          return `Modify ${change.originalRecord.type} record "${change.originalRecord.name}": change ${changes.join(' and ')}`;
        case 'RESTORE':
          return change.record ? 
            `Restore ${change.record.type} record "${change.record.name}" with value "${change.record.value}" from backup` :
            'Restore record from backup';
        default:
          return `Unknown change type: ${change.type}`;
      }
    } catch (error) {
      console.error('Error generating change description:', error, change);
      return 'Invalid change';
    }
  };

  const getChangeIcon = (type) => {
    if (!type) return null;

    switch (type) {
      case 'ADD':
        return <AddIcon color="success" />;
      case 'DELETE':
        return <DeleteIcon color="error" />;
      case 'MODIFY':
        return <EditIcon color="warning" />;
      case 'RESTORE':
        return <RestoreIcon color="info" />;
      default:
        return null;
    }
  };

  const toggleExpanded = (changeId) => {
    setExpandedItems(prev => ({
      ...prev,
      [changeId]: !prev[changeId]
    }));
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: 400 }
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Pending Changes ({pendingChanges.length})
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <List>
          {pendingChanges.map((change, index) => (
            <React.Fragment key={typeof change.id === 'undefined' ? index : change.id}>
              <ListItem
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                sx={{
                  cursor: 'grab',
                  backgroundColor: draggingIndex === index ? 'action.hover' : 'inherit',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  },
                  pr: 6
                }}
                onClick={() => toggleExpanded(change.id || `temp-${index}`)}
              >
                <DragIndicator sx={{ mr: 1, cursor: 'grab', flexShrink: 0 }} />
                <ListItemText
                  sx={{ 
                    mr: 1,
                    '& .MuiListItemText-primary': {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'nowrap',
                      minWidth: 0
                    },
                    '& .MuiTypography-root': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }
                  }}
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" component="span">
                      {getChangeIcon(change.type)}
                      <Typography component="span" noWrap>{getChangeDescription(change)}</Typography>
                      <IconButton 
                        size="small" 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(change.id || `temp-${index}`);
                        }}
                      >
                        {expandedItems[change.id || `temp-${index}`] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Stack>
                  }
                  secondary={
                    <Stack component="span" spacing={0.5}>
                      <Typography 
                        variant="body2" 
                        color="text.secondary" 
                        component="span"
                        noWrap
                      >
                        Zone: {change.zone}
                      </Typography>
                      {change.source && (
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          component="span"
                          noWrap
                        >
                          Source: {change.source.type} ({new Date(change.source.timestamp).toLocaleString()})
                        </Typography>
                      )}
                    </Stack>
                  }
                />
                <IconButton
                  edge="end"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePendingChange(change.id);
                  }}
                  disabled={applying}
                  sx={{ 
                    position: 'absolute',
                    right: 8
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItem>
              <Collapse in={expandedItems[change.id || `temp-${index}`]} timeout="auto" unmountOnExit>
                <Box sx={{ p: 2, pl: 6, bgcolor: 'action.hover' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Full Change Details:
                  </Typography>
                  {change.type === 'MODIFY' ? (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Original Record:
                      </Typography>
                      <Box component="pre" sx={{ 
                        p: 1, 
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(change.originalRecord, null, 2)}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        New Record:
                      </Typography>
                      <Box component="pre" sx={{ 
                        p: 1, 
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(change.newRecord, null, 2)}
                      </Box>
                    </>
                  ) : (
                    <Box component="pre" sx={{ 
                      p: 1, 
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      overflow: 'auto'
                    }}>
                      {JSON.stringify(change.record, null, 2)}
                    </Box>
                  )}
                </Box>
              </Collapse>
              <Divider />
            </React.Fragment>
          ))}
        </List>

        {pendingChanges.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleApplyChanges}
              disabled={applying}
              fullWidth
            >
              {applying ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Apply Changes'
              )}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={clearPendingChanges}
              disabled={applying}
            >
              Clear All
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}

export default PendingChangesDrawer; 