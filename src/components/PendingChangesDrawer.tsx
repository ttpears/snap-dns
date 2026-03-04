import React, { useState, useEffect } from 'react';
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
import { notificationService } from '../services/notificationService';
import { usePendingChanges } from '../context/PendingChangesContext';
import { backupService } from '../services/backupService';
import { useConfig } from '../context/ConfigContext';
import { tsigKeyService, TSIGKey } from '../services/tsigKeyService';
import { useNotification } from '../context/NotificationContext';
import { PendingChange } from '../types/dns';

interface PendingChangesDrawerProps {
  open: boolean;
  onClose: () => void;
  removePendingChange: (changeId: string) => void;
  clearPendingChanges: () => void;
}

function PendingChangesDrawer({
  open,
  onClose,
  removePendingChange,
  clearPendingChanges
}: PendingChangesDrawerProps) {
  const {
    pendingChanges,
    setPendingChanges,
    setShowPendingDrawer
  } = usePendingChanges();
  const { config } = useConfig();
  const { showSuccess, showError } = useNotification();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [backendKeys, setBackendKeys] = useState<TSIGKey[]>([]);

  // Load keys from backend API
  useEffect(() => {
    const loadKeys = async () => {
      try {
        const keys = await tsigKeyService.listKeys();
        setBackendKeys(keys);
      } catch (error) {
        console.error('Failed to load keys:', error);
        // Fall back to config keys if backend fails
        setBackendKeys((config.keys || []) as unknown as TSIGKey[]);
      }
    };

    loadKeys();
  }, [config.keys]);

  useEffect(() => {
    setExpandedItems({});
  }, [pendingChanges.length]);

  useEffect(() => {
    if (pendingChanges.length > 0) {
      setShowPendingDrawer(true);
    }
  }, [pendingChanges.length, setShowPendingDrawer]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
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
      const changesByZone = pendingChanges.reduce((acc: Record<string, PendingChange[]>, change) => {
        if (!acc[change.zone]) {
          acc[change.zone] = [];
        }
        acc[change.zone].push(change);
        return acc;
      }, {});

      // Track all successful changes for notification
      const allSuccessfulChanges: PendingChange[] = [];
      const affectedZones: string[] = [];

      // Apply changes zone by zone
      for (const [zone, changes] of Object.entries(changesByZone) as [string, PendingChange[]][]) {
        try {
          // Get the first change to determine the key being used
          const firstChange = changes[0];
          const keyConfig = backendKeys.find(k => k.id === firstChange.keyId);

          if (!keyConfig) {
            throw new Error(`No key configuration found for zone ${zone}`);
          }

          // Create automatic snapshot before applying changes
          // Backend will look up key server-side based on user permissions
          const currentRecords = await dnsService.fetchZoneRecords(zone);

          try {
            await backupService.createBackup(zone, currentRecords, {
              type: 'auto',
              description: `Automatic snapshot before applying ${changes.length} change${changes.length !== 1 ? 's' : ''}`,
              server: keyConfig.server,
              config: config as any
            });
            console.log(`Auto-snapshot created for zone ${zone}`);
          } catch (backupError) {
            console.warn('Failed to create auto-snapshot:', backupError);
            // Don't fail the entire operation if snapshot creation fails
          }

          // Apply changes in order
          for (const change of changes) {
            try {
              switch ((change as any).type) {
                case 'ADD':
                  await dnsService.addRecord(zone, change.record! as any);
                  allSuccessfulChanges.push({
                    ...change,
                    type: 'ADD'
                  });
                  break;
                case 'RESTORE':
                  // For restore, we need to ensure the record is properly formatted
                  const recordToRestore = {
                    ...change.record!,
                    name: change.record!.name,
                    type: change.record!.type,
                    value: change.record!.value,
                    ttl: change.record!.ttl || 3600  // Ensure TTL exists
                  };
                  await dnsService.addRecord(zone, recordToRestore as any);
                  allSuccessfulChanges.push({
                    ...change,
                    type: 'ADD',
                    record: recordToRestore as any
                  });
                  break;
                case 'DELETE':
                  await dnsService.deleteRecord(zone, change.record! as any);
                  allSuccessfulChanges.push(change);
                  break;
                case 'MODIFY':
                  // Use atomic update for modifications (especially important for SOA)
                  await dnsService.updateRecord(zone, change.originalRecord! as any, change.newRecord! as any);
                  allSuccessfulChanges.push(change);
                  break;
                default:
                  console.warn(`Unknown change type: ${change.type}`);
              }
            } catch (changeError) {
              console.error(`Failed to apply change:`, changeError);
              throw new Error(`Failed to apply change: ${(changeError as Error).message}`);
            }
          }

          // Add zone to affected zones
          if (!affectedZones.includes(zone)) {
            affectedZones.push(zone);
          }

          // Dispatch event to notify components that changes were applied
          window.dispatchEvent(new CustomEvent('dnsChangesApplied', {
            detail: { zones: [zone] }
          }));
        } catch (error) {
          console.error(`Failed to process changes for zone ${zone}:`, error);
          throw error;
        }
      }

      // Send a single notification for all successful changes
      if (allSuccessfulChanges.length > 0) {
        try {
          await notificationService.sendNotification('Multiple Zones', {
            changes: allSuccessfulChanges,
            zones: affectedZones,
            timestamp: Date.now(),
            totalChanges: allSuccessfulChanges.length
          });
        } catch (notifyError) {
          console.warn('Failed to send notification:', notifyError);
        }
      }

      clearPendingChanges();
      showSuccess(`Successfully applied ${allSuccessfulChanges.length} change${allSuccessfulChanges.length !== 1 ? 's' : ''} to ${affectedZones.length} zone${affectedZones.length !== 1 ? 's' : ''}`);
      onClose();
    } catch (error) {
      console.error('Failed to apply changes:', error);
      const errorMessage = `Failed to apply changes: ${(error as Error).message}`;
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setApplying(false);
    }
  };

  const getChangeDescription = (change: PendingChange): string => {
    if (!change || !change.type) {
      console.warn('Invalid change object:', change);
      return 'Unknown change';
    }

    try {
      switch ((change as any).type) {
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
          return `Unknown change type: ${(change as any).type}`;
      }
    } catch (err) {
      console.error('Error generating change description:', err, change);
      return 'Invalid change';
    }
  };

  const getChangeIcon = (type: string): React.ReactNode => {
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

  const toggleExpanded = (changeId: string) => {
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
            <React.Fragment key={(change as any).id || `change-${index}`}>
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
                onClick={() => toggleExpanded((change as any).id || `temp-${index}`)}
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
                          toggleExpanded((change as any).id || `temp-${index}`);
                        }}
                      >
                        {expandedItems[(change as any).id || `temp-${index}`] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
                      {(change as any).source && (
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          component="span"
                          noWrap
                        >
                          Source: {(change as any).source.type} ({new Date((change as any).source.timestamp).toLocaleString()})
                        </Typography>
                      )}
                    </Stack>
                  }
                />
                <IconButton
                  edge="end"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePendingChange((change as any).id);
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
              <Collapse
                in={Boolean(expandedItems[(change as any).id || `temp-${index}`])}
                timeout="auto" 
                unmountOnExit
              >
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