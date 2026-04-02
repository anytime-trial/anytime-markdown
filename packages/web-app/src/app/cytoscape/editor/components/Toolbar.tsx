'use client';

import { useCallback } from 'react';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import NearMeIcon from '@mui/icons-material/NearMe';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import TimelineIcon from '@mui/icons-material/Timeline';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

type EditorMode = 'select' | 'addNode' | 'addEdge';

interface ToolbarProps {
  readonly mode: EditorMode;
  readonly onModeChange: (mode: EditorMode) => void;
  readonly onDelete: () => void;
  readonly onLayout: (name: string) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onImport: () => void;
  readonly onExport: () => void;
}

const LAYOUT_OPTIONS = [
  { value: 'cose', label: 'CoSE' },
  { value: 'breadthfirst', label: 'Breadthfirst' },
  { value: 'circle', label: 'Circle' },
  { value: 'concentric', label: 'Concentric' },
  { value: 'grid', label: 'Grid' },
] as const;

export function Toolbar({
  mode,
  onModeChange,
  onDelete,
  onLayout,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onImport,
  onExport,
}: Readonly<ToolbarProps>) {
  const handleModeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newMode: EditorMode | null) => {
      if (newMode !== null) {
        onModeChange(newMode);
      }
    },
    [onModeChange],
  );

  const handleLayoutChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      onLayout(event.target.value);
    },
    [onLayout],
  );

  return (
    <Paper
      elevation={1}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        flexWrap: 'wrap',
      }}
    >
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={handleModeChange}
        size="small"
        aria-label="Editor mode"
      >
        <ToggleButton value="select" aria-label="Select mode">
          <Tooltip title="Select">
            <NearMeIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="addNode" aria-label="Add node mode">
          <Tooltip title="Add Node">
            <AddCircleOutlineIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="addEdge" aria-label="Add edge mode">
          <Tooltip title="Add Edge">
            <TimelineIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Delete selected">
        <IconButton size="small" onClick={onDelete} aria-label="Delete selected element">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Apply layout">
        <Select
          size="small"
          defaultValue="cose"
          onChange={handleLayoutChange}
          sx={{ minWidth: 130 }}
          startAdornment={<ViewModuleIcon fontSize="small" sx={{ mr: 0.5 }} />}
          aria-label="Layout algorithm"
        >
          {LAYOUT_OPTIONS.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Undo">
        <span>
          <IconButton size="small" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redo">
        <span>
          <IconButton size="small" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Import JSON">
        <IconButton size="small" onClick={onImport} aria-label="Import graph JSON">
          <FileUploadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Export JSON">
        <IconButton size="small" onClick={onExport} aria-label="Export graph JSON">
          <FileDownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}
