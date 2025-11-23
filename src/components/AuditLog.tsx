// src/components/AuditLog.tsx
// Audit log viewer component with filtering and export

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Chip,
  Grid,
  TablePagination,
  CircularProgress,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { auditService } from '../services/auditService';
import { AuditEntry, AuditEventType, AuditQueryFilters } from '../types/audit';
import { useNotification } from '../context/NotificationContext';

// Helper to format event types for display
const formatEventType = (eventType: string): string => {
  return eventType
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' > ');
};

// Helper to get color for event category
const getEventColor = (eventType: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
  if (eventType.startsWith('auth.login.success')) return 'success';
  if (eventType.startsWith('auth.login.failure')) return 'error';
  if (eventType.startsWith('security.')) return 'error';
  if (eventType.startsWith('dns.')) return 'info';
  if (eventType.startsWith('user.') || eventType.startsWith('tsig.')) return 'warning';
  return 'default';
};

const AuditLog: React.FC = () => {
  const { showNotification } = useNotification();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [successFilter, setSuccessFilter] = useState<string>('all');

  // Load audit logs
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: AuditQueryFilters = {
        limit: 10000, // Get all recent logs
      };

      const data = await auditService.queryLogs(filters);
      setEntries(data);
      setFilteredEntries(data);
    } catch (err: any) {
      console.error('Error loading audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
      showNotification(err.message || 'Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  // Apply client-side filters
  useEffect(() => {
    let filtered = [...entries];

    // Event type filter
    if (eventTypeFilter) {
      filtered = filtered.filter(e => e.eventType === eventTypeFilter);
    }

    // User filter (searches both username and userId)
    if (userFilter) {
      const searchTerm = userFilter.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.username?.toLowerCase().includes(searchTerm) ||
          e.userId?.toLowerCase().includes(searchTerm)
      );
    }

    // Date range filter
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter(e => new Date(e.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include entire end date
      filtered = filtered.filter(e => new Date(e.timestamp) <= end);
    }

    // Success filter
    if (successFilter !== 'all') {
      const success = successFilter === 'success';
      filtered = filtered.filter(e => e.success === success);
    }

    setFilteredEntries(filtered);
    setPage(0); // Reset to first page when filters change
  }, [entries, eventTypeFilter, userFilter, startDate, endDate, successFilter]);

  // Load logs on mount
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Clear all filters
  const handleClearFilters = () => {
    setEventTypeFilter('');
    setUserFilter('');
    setStartDate('');
    setEndDate('');
    setSuccessFilter('all');
  };

  // Export handlers
  const handleExportCSV = () => {
    try {
      auditService.exportAsCSV(filteredEntries);
      showNotification(`Exported ${filteredEntries.length} audit logs as CSV`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to export CSV', 'error');
    }
  };

  const handleExportJSON = () => {
    try {
      auditService.exportAsJSON(filteredEntries);
      showNotification(`Exported ${filteredEntries.length} audit logs as JSON`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to export JSON', 'error');
    }
  };

  // Pagination handlers
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Get unique event types for filter dropdown
  const uniqueEventTypes = Array.from(new Set(entries.map(e => e.eventType))).sort();

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">Audit Logs</Typography>
        <Box>
          <Tooltip title="Refresh logs">
            <IconButton onClick={loadLogs} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export as CSV">
            <IconButton onClick={handleExportCSV} disabled={filteredEntries.length === 0}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportJSON}
            disabled={filteredEntries.length === 0}
            sx={{ ml: 1 }}
          >
            Export JSON
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <FilterIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Filters</Typography>
          <Button
            size="small"
            startIcon={<ClearIcon />}
            onClick={handleClearFilters}
            sx={{ ml: 'auto' }}
          >
            Clear All
          </Button>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Event Type</InputLabel>
              <Select
                value={eventTypeFilter}
                label="Event Type"
                onChange={(e) => setEventTypeFilter(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                {uniqueEventTypes.map(type => (
                  <MenuItem key={type} value={type}>
                    {formatEventType(type)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="User"
              placeholder="Username or ID"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={successFilter}
                label="Status"
                onChange={(e) => setSuccessFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="success">Success</MenuItem>
                <MenuItem value="failure">Failure</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Showing {filteredEntries.length} of {entries.length} logs
        </Typography>
      </Paper>

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading state */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Logs table */}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Event Type</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>IP Address</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary" sx={{ py: 4 }}>
                        No audit logs found
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((entry, index) => (
                      <TableRow key={`${entry.timestamp}-${index}`} hover>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {new Date(entry.timestamp).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={formatEventType(entry.eventType)}
                            size="small"
                            color={getEventColor(entry.eventType)}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {entry.username || entry.userId || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={entry.success ? 'Success' : 'Failure'}
                            size="small"
                            color={entry.success ? 'success' : 'error'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {entry.ipAddress || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {entry.error ? (
                            <Tooltip title={entry.error}>
                              <Typography
                                variant="body2"
                                color="error"
                                noWrap
                                sx={{ maxWidth: 200 }}
                              >
                                {entry.error}
                              </Typography>
                            </Tooltip>
                          ) : entry.details ? (
                            <Tooltip title={JSON.stringify(entry.details, null, 2)}>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                noWrap
                                sx={{ maxWidth: 200 }}
                              >
                                {JSON.stringify(entry.details)}
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              -
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination */}
          {filteredEntries.length > 0 && (
            <TablePagination
              component="div"
              count={filteredEntries.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          )}
        </>
      )}
    </Box>
  );
};

export default AuditLog;
