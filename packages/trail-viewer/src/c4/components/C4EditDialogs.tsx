import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { memo, useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface ElementFormData {
  type: 'person' | 'system';
  name: string;
  description: string;
  external: boolean;
}

export interface RelationshipFormData {
  from: string;
  to: string;
  label: string;
  technology: string;
}

// ---------------------------------------------------------------------------
//  AddElementDialog
// ---------------------------------------------------------------------------

interface AddElementDialogProps {
  readonly open: boolean;
  readonly elementType: 'person' | 'system';
  readonly initial?: Partial<ElementFormData>;
  readonly onSubmit: (data: ElementFormData) => void;
  readonly onClose: () => void;
}

export const AddElementDialog = memo(({ open, elementType, initial, onSubmit, onClose }: Readonly<AddElementDialogProps>) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [external, setExternal] = useState(true);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setExternal(initial?.external ?? true);
    }
  }, [open, initial]);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;
    onSubmit({ type: elementType, name: name.trim(), description: description.trim(), external });
    onClose();
  }, [name, description, external, elementType, onSubmit, onClose]);

  const title = elementType === 'person' ? 'Add Person' : 'Add System';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{initial?.name ? 'Edit Element' : title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            required
            size="small"
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            size="small"
            multiline
            minRows={2}
          />
          {elementType === 'system' && (
            <FormControlLabel
              control={<Checkbox checked={external} onChange={e => setExternal(e.target.checked)} />}
              label="External system"
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!name.trim()}>
          {initial?.name ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});
AddElementDialog.displayName = 'AddElementDialog';

// ---------------------------------------------------------------------------
//  AddRelationshipDialog
// ---------------------------------------------------------------------------

export interface ElementOption {
  readonly id: string;
  readonly name: string;
}

interface AddRelationshipDialogProps {
  readonly open: boolean;
  readonly fromName: string;
  readonly onSubmit: (data: RelationshipFormData) => void;
  readonly onClose: () => void;
  readonly from: string;
  /** 選択候補の要素一覧（from 以外） */
  readonly candidates: readonly ElementOption[];
}

export const AddRelationshipDialog = memo(({ open, fromName, from, candidates, onSubmit, onClose }: Readonly<AddRelationshipDialogProps>) => {
  const [toId, setToId] = useState('');
  const [label, setLabel] = useState('');
  const [technology, setTechnology] = useState('');

  useEffect(() => {
    if (open) {
      setToId('');
      setLabel('');
      setTechnology('');
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    if (!toId) return;
    onSubmit({ from, to: toId, label: label.trim(), technology: technology.trim() });
    onClose();
  }, [from, toId, label, technology, onSubmit, onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Relationship</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="From" value={fromName} size="small" slotProps={{ input: { readOnly: true } }} />
          <TextField
            label="To"
            select
            value={toId}
            onChange={e => setToId(e.target.value)}
            size="small"
            required
          >
            {candidates.map(c => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            size="small"
            placeholder="e.g. Uses, Calls, Reads from"
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          />
          <TextField
            label="Technology"
            value={technology}
            onChange={e => setTechnology(e.target.value)}
            size="small"
            placeholder="e.g. REST API, gRPC"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!toId}>Add</Button>
      </DialogActions>
    </Dialog>
  );
});
AddRelationshipDialog.displayName = 'AddRelationshipDialog';
