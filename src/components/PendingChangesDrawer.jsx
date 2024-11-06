import React from 'react';
import { 
  Drawer, 
  Box, 
  Typography, 
  Button, 
  Alert,
  IconButton 
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { usePendingChanges } from '../context/PendingChangesContext';

export function PendingChangesDrawer() {
  const { 
    pendingChanges, 
    removePendingChange, 
    showPendingDrawer, 
    setShowPendingDrawer,
    setPendingChanges 
  } = usePendingChanges();

  const onDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(pendingChanges);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setPendingChanges(items);
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
          zIndex: 1
        }}>
          <Button 
            onClick={() => setShowPendingDrawer(false)}
            fullWidth
            variant="contained"
          >
            Close
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
} 