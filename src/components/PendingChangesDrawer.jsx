import React from 'react';
import { 
  Drawer, 
  Box, 
  Typography, 
  Button, 
  Alert,
  IconButton,
  CircularProgress 
} from '@mui/material';
import { 
  Delete as DeleteIcon,
  Save as SaveIcon,
  DragIndicator as DragIndicatorIcon
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePendingChanges } from '../context/PendingChangesContext';
import { useZone } from '../context/ZoneContext';
import { useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { notificationService } from '../services/notificationService';
import { backupService } from '../services/backupService';

function SortableChange({ change, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: change.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Alert 
        severity="info" 
        sx={{ 
          mb: 1,
          display: 'flex',
          alignItems: 'center'
        }}
        icon={
          <DragIndicatorIcon
            {...attributes}
            {...listeners}
            sx={{ cursor: 'grab' }}
          />
        }
        action={
          <IconButton
            size="small"
            onClick={() => onRemove(change.id)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        }
      >
        {change.type === 'DELETE' && (
          `DELETE: ${change.record.name} ${change.record.ttl} ${change.record.type} ${change.record.value}`
        )}
        {change.type === 'ADD' && (
          `ADD: ${change.record.name} ${change.record.ttl} ${change.record.type} ${change.record.value}`
        )}
        {change.type === 'MODIFY' && (
          `MODIFY: ${change.originalRecord.name}\n` +
          `FROM: ${change.originalRecord.ttl} ${change.originalRecord.type} ${change.originalRecord.value}\n` +
          `TO: ${change.newRecord.ttl} ${change.newRecord.type} ${change.newRecord.value}`
        )}
      </Alert>
    </div>
  );
}

export function PendingChangesDrawer() {
  const { config } = useConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const { 
    pendingChanges, 
    removePendingChange, 
    showPendingDrawer, 
    setShowPendingDrawer,
    setPendingChanges,
    clearPendingChanges 
  } = usePendingChanges();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const applyChanges = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    
    try {
      // First pass: validate all changes have valid keys
      for (const change of pendingChanges) {
        if (!change.keyId) {
          throw new Error('Change missing keyId');
        }
        const keyConfig = config.keys.find(key => key.id === change.keyId);
        if (!keyConfig) {
          throw new Error(`No key configuration found for key ID: ${change.keyId}`);
        }
      }

      // Create automatic backup before applying changes
      for (const change of pendingChanges) {
        const keyConfig = config.keys.find(key => key.id === change.keyId);
        const affectedRecords = pendingChanges
          .filter(c => c.zone === change.zone)
          .map(c => {
            switch (c.type) {
              case 'MODIFY':
                return c.originalRecord;
              case 'DELETE':
                return c.record;
              default:
                return null;
            }
          }).filter(Boolean);

        if (affectedRecords.length > 0) {
          await backupService.createBackup(change.zone, affectedRecords, {
            type: 'auto',
            description: 'Automatic backup before changes',
            server: keyConfig.server,
            config: config
          });
        }
      }

      // Apply changes
      for (const change of pendingChanges) {
        const keyConfig = config.keys.find(key => key.id === change.keyId);
        
        switch (change.type) {
          case 'ADD':
            await dnsService.addRecord(change.zone, {
              name: change.record.name,
              type: change.record.type,
              value: change.record.value,
              ttl: change.record.ttl
            }, keyConfig);
            break;
          case 'MODIFY':
            await dnsService.updateRecord(change.zone, change.originalRecord, change.newRecord, keyConfig);
            break;
          case 'DELETE':
            await dnsService.deleteRecord(change.zone, change.record, keyConfig);
            break;
        }
      }

      // Send webhook notification if configured
      if (config.webhookUrl) {
        await notificationService.sendNotification(selectedZone, pendingChanges);
      }

      setSuccess('Changes applied successfully');
      clearPendingChanges();
      setShowPendingDrawer(false);
    } catch (error) {
      console.error('Failed to apply changes:', error);
      setError(`Failed to apply changes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setPendingChanges((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <Drawer
      anchor="right"
      open={showPendingDrawer}
      onClose={() => setShowPendingDrawer(false)}
    >
      <Box sx={{ width: 400, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ 
          p: 2, 
          borderBottom: 1, 
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          position: 'sticky',
          top: 0,
          zIndex: 1
        }}>
          <Typography variant="h6">Pending Changes</Typography>
        </Box>

        <Box sx={{ p: 2, mt: 1, flexGrow: 1, overflowY: 'auto' }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pendingChanges.map(change => change.id)}
              strategy={verticalListSortingStrategy}
            >
              {pendingChanges.map((change) => (
                <SortableChange
                  key={change.id}
                  change={change}
                  onRemove={removePendingChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </Box>

        <Box sx={{ 
          p: 2, 
          borderTop: 1, 
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2
        }}>
          <Button 
            onClick={() => setShowPendingDrawer(false)}
            variant="outlined"
          >
            Close
          </Button>
          <Button
            onClick={applyChanges}
            variant="contained"
            color="primary"
            disabled={pendingChanges.length === 0 || loading}
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            Apply Changes
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}

export default PendingChangesDrawer; 