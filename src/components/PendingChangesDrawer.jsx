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
  Save as SaveIcon 
} from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { usePendingChanges } from '../context/PendingChangesContext';
import { useZone } from '../context/ZoneContext';
import { useState } from 'react';
import { useConfig } from '../context/ConfigContext';
import { dnsService } from '../services/dnsService';
import { notificationService } from '../services/notificationService';

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

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(pendingChanges);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setPendingChanges(items);
  };

  const applyChanges = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const keyConfig = config.keys.find(key => key.zones.includes(selectedZone));
      if (!keyConfig) {
        throw new Error('No key configuration found for this zone');
      }

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
          default:
            console.warn('Unknown change type:', change.type);
        }
      }

      if (config.webhookUrl) {
        try {
          await notificationService.sendNotification(selectedZone, pendingChanges);
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
        }
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
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="pending-changes">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {pendingChanges.map((change, index) => (
                    <Draggable
                      key={change.id}
                      draggableId={String(change.id)}
                      index={index}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <Alert 
                            severity="info" 
                            sx={{ mb: 1 }}
                            action={
                              <IconButton
                                size="small"
                                onClick={() => removePendingChange(change.id)}
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
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
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