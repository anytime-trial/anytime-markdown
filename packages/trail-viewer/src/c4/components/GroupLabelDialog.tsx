import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useCallback, useEffect, useState } from 'react';

interface GroupLabelDialogProps {
  readonly open: boolean;
  readonly initialLabel?: string;
  readonly onClose: () => void;
  readonly onSave: (label: string) => void;
}

export function GroupLabelDialog({ open, initialLabel, onClose, onSave }: Readonly<GroupLabelDialogProps>) {
  const [label, setLabel] = useState(initialLabel ?? '');

  useEffect(() => {
    if (open) setLabel(initialLabel ?? '');
  }, [open, initialLabel]);

  const handleSave = useCallback(() => {
    onSave(label.trim());
    onClose();
  }, [label, onSave, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }, [handleSave, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>グループラベルの編集</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="ラベル"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={handleSave}>保存</Button>
      </DialogActions>
    </Dialog>
  );
}
