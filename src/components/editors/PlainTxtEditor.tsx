// src/components/editors/PlainTxtEditor.tsx
import React, { useEffect, useState } from 'react';
import { Alert, Box, TextField, Typography } from '@mui/material';
import {
  cleanTxtValue,
  chunkTxtValue,
  serializeTxtForPreview,
  isTxtValueDirty,
} from '../../services/validators/txtRecordUtils';

interface PlainTxtEditorProps {
  value: string | string[];
  onChange: (value: string | string[]) => void;
}

function PlainTxtEditor({ value, onChange }: PlainTxtEditorProps) {
  // Internal cleaned text the user actually edits.
  const [text, setText] = useState<string>(() => cleanTxtValue(value));
  // Whether the loaded value differed from the cleaned form.
  const [wasHealed, setWasHealed] = useState<boolean>(() => isTxtValueDirty(value));
  const [healedDismissed, setHealedDismissed] = useState<boolean>(false);

  // Re-sync if the parent passes in a different value (e.g., loading a different record).
  useEffect(() => {
    const cleaned = cleanTxtValue(value);
    if (cleaned === text) return;
    setText(cleaned);
    setWasHealed(isTxtValueDirty(value));
    setHealedDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const cleaned = cleanTxtValue(e.target.value);
    setText(cleaned);
    onChange(chunkTxtValue(cleaned));
  };

  const chunked = chunkTxtValue(text);
  const segments = Array.isArray(chunked) ? chunked : [chunked];
  const charCount = text.length;
  const chunkCount = segments.length;
  const preview = serializeTxtForPreview(chunked);

  return (
    <Box>
      {wasHealed && !healedDismissed && (
        <Alert
          severity="info"
          onClose={() => setHealedDismissed(true)}
          sx={{ mb: 2 }}
        >
          This record had extra quoting that was cleaned up. Saving will rewrite it cleanly.
        </Alert>
      )}

      <TextField
        fullWidth
        label="Text content"
        value={text}
        onChange={handleChange}
        multiline
        rows={4}
        helperText="Enter the literal text. Quotes are added automatically."
        inputProps={{ 'data-testid': 'plain-txt-input' }}
      />

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1 }}
        data-testid="plain-txt-counter"
      >
        {charCount} character{charCount === 1 ? '' : 's'} · {chunkCount} chunk
        {chunkCount === 1 ? '' : 's'}
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        DNS wire format preview:
      </Typography>
      <Box
        component="pre"
        data-testid="plain-txt-preview"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          backgroundColor: 'action.hover',
          p: 1,
          borderRadius: 1,
          mt: 0.5,
          mb: 0,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {preview}
      </Box>
    </Box>
  );
}

export default PlainTxtEditor;
