// src/components/editors/SpfEditor.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface SpfMechanism {
  qualifier: string;
  type: string;
  value: string;
}

interface SpfEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const MECHANISM_TYPES = ['ip4', 'ip6', 'a', 'mx', 'include', 'all'];
const QUALIFIERS = [
  { value: '+', label: '+ Pass (default)' },
  { value: '-', label: '- Fail' },
  { value: '~', label: '~ SoftFail' },
  { value: '?', label: '? Neutral' },
];

const DNS_LOOKUP_TYPES = ['include', 'a', 'mx'];

function parseSpf(value: string): SpfMechanism[] {
  const trimmed = value.trim();
  if (!/^v=spf1(\s|$)/i.test(trimmed)) return [];

  const tokens = trimmed.replace(/^v=spf1\s*/i, '').split(/\s+/).filter(Boolean);
  return tokens.map(token => {
    const qualifierMatch = token.match(/^([+\-~?])/);
    const qualifier = qualifierMatch ? qualifierMatch[1] : '+';
    const body = qualifierMatch ? token.slice(1) : token;
    const colonIdx = body.indexOf(':');
    const type = (colonIdx >= 0 ? body.slice(0, colonIdx) : body).toLowerCase();
    const mechValue = colonIdx >= 0 ? body.slice(colonIdx + 1) : '';
    return { qualifier, type, value: mechValue };
  });
}

function serializeSpf(mechanisms: SpfMechanism[]): string {
  const parts = mechanisms.map(m => {
    const q = m.qualifier === '+' ? '' : m.qualifier;
    const v = m.value ? `:${m.value}` : '';
    return `${q}${m.type}${v}`;
  });
  return `v=spf1 ${parts.join(' ')}`;
}

export default function SpfEditor({ value, onChange }: SpfEditorProps) {
  const [mechanisms, setMechanisms] = useState<SpfMechanism[]>(() => parseSpf(value));

  // Re-parse when external value changes (e.g., user edits raw textarea)
  useEffect(() => {
    const parsed = parseSpf(value);
    if (parsed.length > 0 || value.trim() === '' || /^v=spf1\s*$/i.test(value.trim())) {
      setMechanisms(parsed);
    }
  }, [value]);

  const update = (newMechanisms: SpfMechanism[]) => {
    setMechanisms(newMechanisms);
    onChange(serializeSpf(newMechanisms));
  };

  const addMechanism = () => {
    update([...mechanisms, { qualifier: '+', type: 'ip4', value: '' }]);
  };

  const removeMechanism = (index: number) => {
    update(mechanisms.filter((_, i) => i !== index));
  };

  const updateMechanism = (index: number, field: keyof SpfMechanism, val: string) => {
    const updated = mechanisms.map((m, i) => i === index ? { ...m, [field]: val } : m);
    update(updated);
  };

  const moveMechanism = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= mechanisms.length) return;
    const updated = [...mechanisms];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    update(updated);
  };

  const dnsLookups = mechanisms.filter(m => DNS_LOOKUP_TYPES.includes(m.type)).length;
  const needsValue = (type: string) => !['all', 'a', 'mx'].includes(type);

  return (
    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" color="textSecondary">
          SPF Editor
        </Typography>
        <Chip
          label={`DNS lookups: ${dnsLookups}/10`}
          size="small"
          color={dnsLookups > 10 ? 'error' : dnsLookups > 7 ? 'warning' : 'default'}
        />
      </Box>

      {mechanisms.map((mech, index) => (
        <Grid container spacing={1} key={index} sx={{ mb: 1, alignItems: 'center' }}>
          <Grid item xs={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Qualifier</InputLabel>
              <Select
                value={mech.qualifier}
                onChange={(e) => updateMechanism(index, 'qualifier', e.target.value)}
                label="Qualifier"
              >
                {QUALIFIERS.map(q => (
                  <MenuItem key={q.value} value={q.value}>{q.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={mech.type}
                onChange={(e) => updateMechanism(index, 'type', e.target.value)}
                label="Type"
              >
                {MECHANISM_TYPES.map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={5}>
            {needsValue(mech.type) && (
              <TextField
                fullWidth
                size="small"
                label={mech.type === 'ip4' ? 'IP/CIDR' : mech.type === 'ip6' ? 'IPv6/CIDR' : 'Domain'}
                value={mech.value}
                onChange={(e) => updateMechanism(index, 'value', e.target.value)}
                placeholder={
                  mech.type === 'ip4' ? '192.168.1.0/24' :
                  mech.type === 'ip6' ? '2001:db8::/32' :
                  '_spf.google.com'
                }
              />
            )}
          </Grid>
          <Grid item xs={2} sx={{ display: 'flex' }}>
            <IconButton size="small" onClick={() => moveMechanism(index, -1)} disabled={index === 0}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => moveMechanism(index, 1)} disabled={index === mechanisms.length - 1}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={() => removeMechanism(index)} color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        </Grid>
      ))}

      <Button size="small" startIcon={<AddIcon />} onClick={addMechanism}>
        Add Mechanism
      </Button>
    </Box>
  );
}
