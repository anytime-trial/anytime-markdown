'use client';

import { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { generatePlaylistName } from '../../../lib/spotify';

interface CreatePlaylistDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  loading: boolean;
}

export function CreatePlaylistDialog({
  open,
  onClose,
  onConfirm,
  loading,
}: Readonly<CreatePlaylistDialogProps>) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(generatePlaylistName());
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>プレイリスト名</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          label="プレイリスト名"
          variant="outlined"
          sx={{ mt: 1 }}
          inputProps={{ maxLength: 100 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          キャンセル
        </Button>
        <Button
          variant="contained"
          onClick={() => onConfirm(name)}
          disabled={loading || name.trim() === ''}
        >
          {loading ? '作成中…' : '作成'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
