import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { memo, useCallback, useEffect, useState } from 'react';
import { SERVICE_CATALOG, filterServices } from '@anytime-markdown/trail-core/c4';
import type { ServiceEntry } from '@anytime-markdown/trail-core/c4';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type C4ElementKind = 'person' | 'system' | 'container' | 'component';

export interface ElementFormData {
  type: C4ElementKind;
  name: string;
  description: string;
  external: boolean;
  parentId?: string | null;
  serviceType?: string;
}

export interface RelationshipFormData {
  from: string;
  to: string;
  label: string;
  technology: string;
}

// ---------------------------------------------------------------------------
//  ServicePicker
// ---------------------------------------------------------------------------

interface ServicePickerProps {
  readonly value: string;
  readonly onChange: (id: string) => void;
}

const ServicePicker = memo(({ value, onChange }: Readonly<ServicePickerProps>) => {
  const [query, setQuery] = useState('');
  const filtered = filterServices(query);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        size="small"
        placeholder="サービス名で検索..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16 }} />
              </InputAdornment>
            ),
          },
        }}
      />
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 0.5,
        maxHeight: 160,
        overflowY: 'auto',
      }}>
        {filtered.map(entry => (
          <ServiceCard
            key={entry.id}
            entry={entry}
            selected={entry.id === value}
            onClick={() => onChange(entry.id === value ? '' : entry.id)}
          />
        ))}
      </Box>
    </Box>
  );
});
ServicePicker.displayName = 'ServicePicker';

interface ServiceCardProps {
  readonly entry: ServiceEntry;
  readonly selected: boolean;
  readonly onClick: () => void;
}

const ServiceCard = memo(({ entry, selected, onClick }: Readonly<ServiceCardProps>) => (
  <Box
    onClick={onClick}
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0.25,
      p: 0.75,
      borderRadius: 1,
      cursor: 'pointer',
      border: '1px solid',
      borderColor: selected ? 'primary.main' : 'divider',
      bgcolor: selected ? 'primary.main' + '1a' : 'transparent',
      '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
    }}
  >
    {entry.iconBody ? (
      <Box
        component="svg"
        viewBox={entry.iconViewBox ?? '0 0 24 24'}
        sx={{ width: 20, height: 20 }}
        // iconBody is static, developer-authored SVG content (not user input)
        dangerouslySetInnerHTML={{ __html: entry.iconBody }}
      />
    ) : (
      <Box
        component="svg"
        viewBox="0 0 24 24"
        sx={{ width: 20, height: 20, fill: entry.brandColor }}
      >
        <path d={entry.iconPath} />
      </Box>
    )}
    <Box sx={{ fontSize: 9, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>
      {entry.label}
    </Box>
  </Box>
));
ServiceCard.displayName = 'ServiceCard';

// ---------------------------------------------------------------------------
//  AddElementDialog
// ---------------------------------------------------------------------------

interface AddElementDialogProps {
  readonly open: boolean;
  readonly elementType: C4ElementKind;
  readonly initial?: Partial<ElementFormData>;
  readonly onSubmit: (data: ElementFormData) => void;
  readonly onClose: () => void;
  /** Parent element candidates (for container/component). */
  readonly parentCandidates?: readonly ElementOption[];
}

const ELEMENT_TYPE_LABELS: Record<C4ElementKind, string> = {
  person: 'Person',
  system: 'System',
  container: 'Container',
  component: 'Component',
};

export const AddElementDialog = memo(({ open, elementType, initial, onSubmit, onClose, parentCandidates }: Readonly<AddElementDialogProps>) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [external, setExternal] = useState(false);
  const [parentId, setParentId] = useState<string>('');
  const [serviceType, setServiceType] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setExternal(initial?.external ?? false);
      setParentId(initial?.parentId ?? '');
      setServiceType(initial?.serviceType ?? '');
    }
  }, [open, initial, elementType]);

  const needsParent = elementType === 'container' || elementType === 'component';

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;
    onSubmit({
      type: elementType,
      name: name.trim(),
      description: description.trim(),
      external,
      parentId: needsParent ? (parentId || null) : null,
      serviceType: serviceType || undefined,
    });
    onClose();
  }, [name, description, external, elementType, parentId, needsParent, serviceType, onSubmit, onClose]);

  const typeLabel = ELEMENT_TYPE_LABELS[elementType];
  const title = initial?.name ? `Edit ${typeLabel}` : `Add ${typeLabel}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
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
          {needsParent && parentCandidates && parentCandidates.length > 0 && (
            <TextField
              label="Parent"
              select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              size="small"
            >
              <MenuItem value="">None</MenuItem>
              {parentCandidates.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          )}
          {elementType === 'container' && (
            <Box>
              <Box sx={{ fontSize: 12, color: 'text.secondary', mb: 0.5 }}>
                外部サービス（任意）
              </Box>
              <ServicePicker value={serviceType} onChange={(id) => {
                setServiceType(id);
                if (id && !name.trim()) {
                  const entry = SERVICE_CATALOG.find(s => s.id === id);
                  if (entry) setName(entry.label);
                }
              }} />
            </Box>
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
