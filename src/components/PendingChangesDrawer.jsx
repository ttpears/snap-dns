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
import { backupService } from '../services/backupService.ts';
import { validationService } from '../services/validationService';
import { DNSValidationService } from '../services/validationService';

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
          `ADD: ${change.name} ${change.ttl} ${change.recordType} ${change.value}`
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
  const { selectedZone } = useZone();
  const { 
    pendingChanges, 
    removePendingChange, 
    showPendingDrawer, 
    setShowPendingDrawer,
    setPendingChanges,
    clearPendingChanges 
  } = usePendingChanges();
  const [loading, setLoading] = useState(false);
  const { config } = useConfig();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const validationService = new DNSValidationService();

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

  const applyChanges = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const keyConfig = config.keys.find(key => key.zones.includes(selectedZone));
      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

      // Validate all pending changes before proceeding
      const validationResult = validationService.validateZoneChanges(pendingChanges, selectedZone);
      if (!validationResult.isValid) {
        setError(`Validation failed:\n${validationResult.errors.join('\n')}`);
        setLoading(false);
        return;
      }

      // Create automatic backup before applying changes
      const affectedRecords = pendingChanges.map(change => {
        switch (change.type) {
          case 'MODIFY':
            return change.originalRecord;
          case 'DELETE':
            return change.record;
          default:
            return null;
        }
      }).filter(Boolean);

      if (affectedRecords.length > 0) {
        await backupService.createBackup(selectedZone, affectedRecords, {
          type: 'auto',
          description: 'Automatic backup before changes',
          server: keyConfig.server,
          config: config
        });
      }

      // Apply changes
      for (const change of pendingChanges) {
        switch (change.type) {
          case 'ADD':
            await dnsService.addRecord(selectedZone, {
              name: change.name,
              type: change.recordType,
              value: change.value,
              ttl: change.ttl
            }, keyConfig);
            break;
          case 'MODIFY':
            await dnsService.updateRecord(selectedZone, change.originalRecord, change.newRecord, keyConfig);
            break;
          case 'DELETE':
            await dnsService.deleteRecord(selectedZone, change.record, keyConfig);
            break;
        }
      }

      if (config.webhookUrl) {
        await notificationService.sendNotification(selectedZone, pendingChanges);
      }

      clearPendingChanges();
      setShowPendingDrawer(false);
      setSuccess('Changes applied successfully');
    } catch (error) {
      console.error('Failed to apply changes:', error);
      setError(`Failed to apply changes: ${error.message}`);
    } finally {
      setLoading(false);
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