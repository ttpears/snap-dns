// src/components/editors/DmarcEditor.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from '@mui/material';

interface DmarcTags {
  p: string;
  sp: string;
  rua: string;
  ruf: string;
  pct: number;
  adkim: string;
  aspf: string;
}

interface DmarcEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const POLICIES = [
  { value: 'none', label: 'none — Monitor only' },
  { value: 'quarantine', label: 'quarantine — Mark as suspicious' },
  { value: 'reject', label: 'reject — Block delivery' },
];

const ALIGNMENTS = [
  { value: '', label: '(default: relaxed)' },
  { value: 'r', label: 'r — Relaxed' },
  { value: 's', label: 's — Strict' },
];

function parseDmarc(value: string): DmarcTags {
  const defaults: DmarcTags = { p: 'none', sp: '', rua: '', ruf: '', pct: 100, adkim: '', aspf: '' };
  const parts = value.split(';').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();

    switch (key) {
      case 'p': defaults.p = val.toLowerCase(); break;
      case 'sp': defaults.sp = val.toLowerCase(); break;
      case 'rua': defaults.rua = val; break;
      case 'ruf': defaults.ruf = val; break;
      case 'pct': defaults.pct = parseInt(val, 10) || 100; break;
      case 'adkim': defaults.adkim = val.toLowerCase(); break;
      case 'aspf': defaults.aspf = val.toLowerCase(); break;
    }
  }

  return defaults;
}

function serializeDmarc(tags: DmarcTags): string {
  const parts = ['v=DMARC1', `p=${tags.p}`];
  if (tags.sp) parts.push(`sp=${tags.sp}`);
  if (tags.rua) parts.push(`rua=${tags.rua}`);
  if (tags.ruf) parts.push(`ruf=${tags.ruf}`);
  if (tags.pct !== 100) parts.push(`pct=${tags.pct}`);
  if (tags.adkim) parts.push(`adkim=${tags.adkim}`);
  if (tags.aspf) parts.push(`aspf=${tags.aspf}`);
  return parts.join('; ');
}

export default function DmarcEditor({ value, onChange }: DmarcEditorProps) {
  const [tags, setTags] = useState<DmarcTags>(() => parseDmarc(value));

  useEffect(() => {
    if (/v=dmarc1/i.test(value)) {
      setTags(parseDmarc(value));
    }
  }, [value]);

  const update = (newTags: DmarcTags) => {
    setTags(newTags);
    onChange(serializeDmarc(newTags));
  };

  return (
    <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2" color="textSecondary" gutterBottom>
        DMARC Editor
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth
            size="small"
            label="Version"
            value="DMARC1"
            disabled
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Policy (p)</InputLabel>
            <Select
              value={tags.p}
              onChange={(e) => update({ ...tags, p: e.target.value })}
              label="Policy (p)"
            >
              {POLICIES.map(p => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>Subdomain Policy (sp)</InputLabel>
            <Select
              value={tags.sp}
              onChange={(e) => update({ ...tags, sp: e.target.value })}
              label="Subdomain Policy (sp)"
            >
              <MenuItem value="">(inherit from p)</MenuItem>
              {POLICIES.map(p => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            size="small"
            label="Aggregate Report URI (rua)"
            value={tags.rua}
            onChange={(e) => update({ ...tags, rua: e.target.value })}
            placeholder="mailto:dmarc-reports@example.com"
            helperText="Where to send aggregate DMARC reports"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            size="small"
            label="Forensic Report URI (ruf)"
            value={tags.ruf}
            onChange={(e) => update({ ...tags, ruf: e.target.value })}
            placeholder="mailto:dmarc-forensics@example.com"
            helperText="Where to send failure reports (optional)"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Percentage (pct): {tags.pct}%
          </Typography>
          <Slider
            value={tags.pct}
            onChange={(_, val) => update({ ...tags, pct: val as number })}
            min={0}
            max={100}
            step={1}
            valueLabelDisplay="auto"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>DKIM Alignment (adkim)</InputLabel>
            <Select
              value={tags.adkim}
              onChange={(e) => update({ ...tags, adkim: e.target.value })}
              label="DKIM Alignment (adkim)"
            >
              {ALIGNMENTS.map(a => (
                <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth size="small">
            <InputLabel>SPF Alignment (aspf)</InputLabel>
            <Select
              value={tags.aspf}
              onChange={(e) => update({ ...tags, aspf: e.target.value })}
              label="SPF Alignment (aspf)"
            >
              {ALIGNMENTS.map(a => (
                <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </Box>
  );
}
