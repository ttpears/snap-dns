// src/services/auditService.ts
// Frontend service for audit log operations

import { AuditEntry, AuditQueryFilters, EventTypesResponse } from '../types/audit';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

class AuditService {
  /**
   * Query audit logs with optional filters
   */
  async queryLogs(filters?: AuditQueryFilters): Promise<AuditEntry[]> {
    try {
      const params = new URLSearchParams();

      if (filters) {
        if (filters.eventType) {
          params.append('eventType', filters.eventType);
        }
        if (filters.userId) {
          params.append('userId', filters.userId);
        }
        if (filters.startDate) {
          params.append('startDate', filters.startDate.toISOString());
        }
        if (filters.endDate) {
          params.append('endDate', filters.endDate.toISOString());
        }
        if (filters.limit) {
          params.append('limit', filters.limit.toString());
        }
      }

      const url = `${API_URL}/api/audit${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to query audit logs' }));
        throw new Error(errorData.error || 'Failed to query audit logs');
      }

      const data = await response.json();
      return data.entries || [];
    } catch (error: any) {
      console.error('Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Get available event types grouped by category
   */
  async getEventTypes(): Promise<EventTypesResponse> {
    try {
      const response = await fetch(`${API_URL}/api/audit/event-types`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to get event types' }));
        throw new Error(errorData.error || 'Failed to get event types');
      }

      const data = await response.json();
      return data.eventTypes;
    } catch (error: any) {
      console.error('Error getting event types:', error);
      throw error;
    }
  }

  /**
   * Export audit logs as CSV
   */
  exportAsCSV(entries: AuditEntry[]): void {
    if (entries.length === 0) {
      throw new Error('No audit logs to export');
    }

    // CSV headers
    const headers = ['Timestamp', 'Event Type', 'User', 'Success', 'IP Address', 'Details', 'Error'];
    const csvRows = [headers.join(',')];

    // Convert entries to CSV rows
    entries.forEach(entry => {
      const row = [
        entry.timestamp,
        entry.eventType,
        entry.username || entry.userId || 'N/A',
        entry.success ? 'Yes' : 'No',
        entry.ipAddress || 'N/A',
        entry.details ? JSON.stringify(entry.details).replace(/"/g, '""') : 'N/A',
        entry.error ? entry.error.replace(/"/g, '""') : 'N/A',
      ];
      csvRows.push(row.map(cell => `"${cell}"`).join(','));
    });

    // Create blob and download
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `audit-logs-${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export audit logs as JSON
   */
  exportAsJSON(entries: AuditEntry[]): void {
    if (entries.length === 0) {
      throw new Error('No audit logs to export');
    }

    const jsonContent = JSON.stringify(entries, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `audit-logs-${new Date().toISOString()}.json`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const auditService = new AuditService();
