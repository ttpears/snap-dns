// src/components/editors/DkimEditor.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';

interface DkimTags {
  k: string;
  p: string;
  t: string[];
  s: string;
}

interface DkimEditorProps {
  value: string;
  onChange: (value: string) => void;
}

function parseDkim(value: string): DkimTags {
  const defaults: DkimTags = { k: 'rsa', p: '', t: [], s: '*' };
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();

    switch (key) {
      case 'k': defaults.k = val || 'rsa'; break;
      case 'p': defaults.p = val; break;
      case 't': defaults.t = val.split(':').map(s => s.trim()).filter(Boolean); break;
      case 's': defaults.s = val || '*'; break;
    }
  }

  return defaults;
}

function serializeDkim(tags: DkimTags): string {
  const parts = ['v=DKIM1', `k=${tags.k}`];
  if (tags.t.length > 0) parts.push(`t=${tags.t.join(':')}`);
  if (tags.s !== '*') parts.push(`s=${tags.s}`);
  parts.push(`p=${tags.p}`);
  return parts.join('; ');
}

export default function DkimEditor({ value, onChange }: DkimEditorProps) {
  const [tags, setTags] = useState<DkimTags>(() => parseDkim(value));

  useEffect(() => {
    if (/v=dkim1/i.test(value)) {
      setTags(parseDkim(value));
    }
  }, [value]);

  const update = (newTags: DkimTags) => {
    setTags(newTags);
    onChange(serializeDkim(newTags));
  };

  const handleFlagToggle = (flag: string) => {
    const newFlags = tags.t.includes(flag)
      ? tags.t.filter(f => f !== flag)
      : [...tags.t, flag];
    update({ ...tags, t: newFlags });
  };

  const handleKeyPaste = (raw: string) => {
    // Strip PEM headers and whitespace
    const cleaned = raw
      .replace(/-----BEGIN [A-Z ]+-----/g, '')
      .replace(/-----END [A-Z ]+-----/g, '')
      .replace(/\s/g, '');
    update({ ...tags, p: cleaned });
  };

  return (
    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
        DKIM Editor
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Version"
            value="DKIM1"
            disabled
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Algorithm (k)</InputLabel>
            <Select
              value={tags.k}
              onChange={(e) => update({ ...tags, k: e.target.value })}
              label="Algorithm (k)"
            >
              <MenuItem value="rsa">rsa</MenuItem>
              <MenuItem value="ed25519">ed25519</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Service Type (s)"
            value={tags.s}
            onChange={(e) => update({ ...tags, s: e.target.value })}
            helperText="Default: * (all services)"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            size="small"
            label="Public Key (p)"
            value={tags.p}
            onChange={(e) => handleKeyPaste(e.target.value)}
            multiline
            rows={3}
            helperText="Paste base64-encoded public key — PEM headers and whitespace are auto-stripped"
            placeholder="MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ..."
          />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Flags (t)
          </Typography>
          <FormGroup row>
            <FormControlLabel
              control={
                <Checkbox
                  checked={tags.t.includes('y')}
                  onChange={() => handleFlagToggle('y')}
                  size="small"
                />
              }
              label="y — Testing mode"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={tags.t.includes('s')}
                  onChange={() => handleFlagToggle('s')}
                  size="small"
                />
              }
              label="s — Strict alignment"
            />
          </FormGroup>
        </Grid>
      </Grid>
    </Box>
  );
}
