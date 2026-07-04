// src/components/PendingChangesDrawer.tsx
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
  Snackbar,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
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
import { dnsService, type BatchChange } from '../services/dnsService';
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

// Per-zone outcome of an apply attempt, shown when a zone's batch fails
interface ZoneApplyFailure {
  zone: string;
  message: string;
  changeCount: number;
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
  const [applyFailures, setApplyFailures] = useState<ZoneApplyFailure[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [applyWarnings, setApplyWarnings] = useState<string[]>([]);
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

  // Group changes by zone; used by both the confirmation dialog and apply
  const changesByZone = pendingChanges.reduce((acc: Record<string, PendingChange[]>, change) => {
    if (!acc[change.zone]) {
      acc[change.zone] = [];
    }
    acc[change.zone].push(change);
    return acc;
  }, {});

  const handleApplyChanges = async () => {
    setConfirmOpen(false);
    setApplying(true);
    setApplyFailures([]);

    // Each zone applies as one atomic transaction; zones are independent, so
    // a failure in one zone doesn't stop the others. Track per-zone outcomes
    // so applied changes can be removed from the queue even on partial failure.
    const appliedChanges: PendingChange[] = [];
    const appliedZones: string[] = [];
    const failures: ZoneApplyFailure[] = [];
    const allWarnings: string[] = [];

    for (const [zone, changes] of Object.entries(changesByZone) as [string, PendingChange[]][]) {
      try {
        // Create automatic snapshot before applying changes
        try {
          const currentRecords = await dnsService.fetchZoneRecords(zone);
          const firstChange = changes[0];
          const keyConfig = backendKeys.find(k => k.id === firstChange.keyId);

          await backupService.createBackup(zone, currentRecords, {
            type: 'auto',
            description: `Automatic snapshot before applying ${changes.length} change${changes.length !== 1 ? 's' : ''}`,
            server: keyConfig?.server || 'unknown',
            config: config as any
          });
        } catch (backupError) {
          console.warn(`Failed to create auto-snapshot for zone ${zone}:`, backupError);
          // Don't fail the entire operation if snapshot creation fails
        }

        // Apply all of this zone's changes as one atomic transaction, so a
        // failure can't leave the zone half-updated.
        const batchChanges: BatchChange[] = changes.map((change) => {
          switch (change.type) {
            case 'ADD':
              return { op: 'add', record: change.record! as any };
            case 'RESTORE':
              return { op: 'add', record: { ...(change.record! as any), ttl: change.record!.ttl || 3600 } };
            case 'DELETE':
              return { op: 'delete', record: change.record! as any };
            case 'MODIFY':
              return { op: 'update', oldRecord: change.originalRecord! as any, newRecord: change.newRecord! as any };
            default:
              throw new Error(`Unknown change type: ${(change as any).type}`);
          }
        });

        const batchResult = await dnsService.applyBatch(zone, batchChanges);
        if (batchResult?.warnings?.length) allWarnings.push(...batchResult.warnings);
        appliedChanges.push(...changes);
        appliedZones.push(zone);

        // Dispatch event to notify components that changes were applied
        window.dispatchEvent(new CustomEvent('dnsChangesApplied', {
          detail: { zones: [zone] }
        }));
      } catch (error) {
        console.error(`Failed to process changes for zone ${zone}:`, error);
        failures.push({
          zone,
          message: (error as Error).message,
          changeCount: changes.length
        });
      }
    }

    // Send a single notification for all successful changes
    if (appliedChanges.length > 0) {
      try {
        await notificationService.sendNotification('Multiple Zones', {
          changes: appliedChanges,
          zones: appliedZones,
          timestamp: Date.now(),
          totalChanges: appliedChanges.length
        });
      } catch (notifyError) {
        console.warn('Failed to send notification:', notifyError);
      }
    }

    // Remove applied changes from the queue even when other zones failed, so
    // a re-apply can never double-apply committed changes.
    if (appliedChanges.length > 0) {
      const appliedIds = new Set(appliedChanges.map(c => c.id));
      setPendingChanges(prev => prev.filter(c => !appliedIds.has(c.id)));
    }

    if (allWarnings.length > 0) {
      setApplyWarnings(allWarnings);
    }

    if (failures.length === 0) {
      showSuccess(`Successfully applied ${appliedChanges.length} change${appliedChanges.length !== 1 ? 's' : ''} to ${appliedZones.length} zone${appliedZones.length !== 1 ? 's' : ''}`);
      setShowPendingDrawer(false);
      onClose();
    } else {
      if (appliedChanges.length > 0) {
        showSuccess(`Applied ${appliedChanges.length} change${appliedChanges.length !== 1 ? 's' : ''} to ${appliedZones.length} zone${appliedZones.length !== 1 ? 's' : ''}`);
      }
      setApplyFailures(failures);
      showError(`Failed to apply changes to ${failures.length} zone${failures.length !== 1 ? 's' : ''}`);
    }

    setApplying(false);
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
          <IconButton onClick={onClose} size="small" aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Box>

        {applyFailures.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setApplyFailures([])}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
              Some zones failed to apply. Their changes are still pending below.
            </Typography>
            {applyFailures.map(failure => (
              <Typography variant="body2" key={failure.zone}>
                {failure.zone} ({failure.changeCount} change{failure.changeCount !== 1 ? 's' : ''}): {failure.message}
              </Typography>
            ))}
          </Alert>
        )}

        <List>
          {pendingChanges.map((change, index) => (
            <React.Fragment key={change.id}>
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
                onClick={() => toggleExpanded(change.id)}
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
                          toggleExpanded(change.id);
                        }}
                      >
                        {expandedItems[change.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
                  aria-label="delete"
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
              <Collapse
                in={Boolean(expandedItems[change.id])}
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
              onClick={() => setConfirmOpen(true)}
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
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Apply changes to live DNS?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {Object.entries(changesByZone).map(([zone, changes]) => (
              <Typography variant="body2" key={zone}>
                {zone}: {changes.length} change{changes.length !== 1 ? 's' : ''}
              </Typography>
            ))}
            <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
              An automatic snapshot of each zone is taken before applying.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleApplyChanges} autoFocus>
            Apply {pendingChanges.length} change{pendingChanges.length !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={applyWarnings.length > 0}
        autoHideDuration={10000}
        onClose={() => setApplyWarnings([])}
      >
        <Alert severity="warning" onClose={() => setApplyWarnings([])}>
          {applyWarnings.map((w, i) => <div key={i}>{w}</div>)}
        </Alert>
      </Snackbar>
    </Drawer>
  );
}

export default PendingChangesDrawer; 