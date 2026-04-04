'use client';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, Chip,Divider, IconButton, Slider, TextField, Typography } from '@mui/material';
import { useCallback,useState } from 'react';

import type { NodeFilterConfig, RangeFilter, TextFilter } from '../types/nodeFilter';

interface FilterPanelProps {
  readonly config: NodeFilterConfig;
  readonly onConfigChange: (config: NodeFilterConfig) => void;
  /** metadata から検出されたキーの一覧 */
  readonly availableKeys: readonly string[];
  /** 各数値キーの [min, max] 範囲 */
  readonly keyRanges: ReadonlyMap<string, readonly [number, number]>;
  readonly onClose: () => void;
}

export function FilterPanel({
  config, onConfigChange, availableKeys, keyRanges, onClose,
}: Readonly<FilterPanelProps>) {
  const [newRangeKey, setNewRangeKey] = useState('');
  const [newTextKey, setNewTextKey] = useState('');

  const addRangeFilter = useCallback(() => {
    if (!newRangeKey) return;
    const range = keyRanges.get(newRangeKey);
    const filter: RangeFilter = {
      key: newRangeKey,
      min: range?.[0],
      max: range?.[1],
    };
    onConfigChange({
      ...config,
      rangeFilters: [...config.rangeFilters, filter],
    });
    setNewRangeKey('');
  }, [newRangeKey, config, keyRanges, onConfigChange]);

  const updateRangeFilter = useCallback((index: number, changes: Partial<RangeFilter>) => {
    const updated = config.rangeFilters.map((rf, i) =>
      i === index ? { ...rf, ...changes } : rf,
    );
    onConfigChange({ ...config, rangeFilters: updated });
  }, [config, onConfigChange]);

  const removeRangeFilter = useCallback((index: number) => {
    onConfigChange({
      ...config,
      rangeFilters: config.rangeFilters.filter((_, i) => i !== index),
    });
  }, [config, onConfigChange]);

  const addTextFilter = useCallback(() => {
    if (!newTextKey) return;
    const filter: TextFilter = { key: newTextKey, value: '' };
    onConfigChange({
      ...config,
      textFilters: [...config.textFilters, filter],
    });
    setNewTextKey('');
  }, [newTextKey, config, onConfigChange]);

  const updateTextFilter = useCallback((index: number, value: string) => {
    const updated = config.textFilters.map((tf, i) =>
      i === index ? { ...tf, value } : tf,
    );
    onConfigChange({ ...config, textFilters: updated });
  }, [config, onConfigChange]);

  const removeTextFilter = useCallback((index: number) => {
    onConfigChange({
      ...config,
      textFilters: config.textFilters.filter((_, i) => i !== index),
    });
  }, [config, onConfigChange]);

  const numericKeys = availableKeys.filter(k => keyRanges.has(k));
  const textKeys = availableKeys.filter(k => !keyRanges.has(k));

  return (
    <Box sx={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 280,
      bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider',
      overflowY: 'auto', zIndex: 10, display: 'flex', flexDirection: 'column',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', p: 1.5, gap: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
          Filter
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close filter panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      {/* 数値範囲フィルタ */}
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Range Filters
        </Typography>
        {config.rangeFilters.map((rf, i) => {
          const range = keyRanges.get(rf.key);
          const min = range?.[0] ?? 0;
          const max = range?.[1] ?? 100;
          return (
            <Box key={`${rf.key}-${i}`} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip label={rf.key} size="small" />
                <IconButton size="small" onClick={() => removeRangeFilter(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              <Slider
                value={[rf.min ?? min, rf.max ?? max]}
                min={min}
                max={max}
                onChange={(_, value) => {
                  const [lo, hi] = value as number[];
                  updateRangeFilter(i, { min: lo, max: hi });
                }}
                valueLabelDisplay="auto"
                size="small"
                sx={{ mt: 0.5 }}
              />
            </Box>
          );
        })}
        {numericKeys.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              select
              size="small"
              value={newRangeKey}
              onChange={e => setNewRangeKey(e.target.value)}
              SelectProps={{ native: true }}
              sx={{ flex: 1 }}
            >
              <option value="">Select key</option>
              {numericKeys
                .filter(k => !config.rangeFilters.some(rf => rf.key === k))
                .map(k => <option key={k} value={k}>{k}</option>)}
            </TextField>
            <IconButton size="small" onClick={addRangeFilter} disabled={!newRangeKey}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Divider />

      {/* テキストフィルタ */}
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Text Filters
        </Typography>
        {config.textFilters.map((tf, i) => (
          <Box key={`${tf.key}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <Chip label={tf.key} size="small" />
            <TextField
              size="small"
              value={tf.value}
              onChange={e => updateTextFilter(i, e.target.value)}
              placeholder="Search..."
              sx={{ flex: 1 }}
            />
            <IconButton size="small" onClick={() => removeTextFilter(i)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {textKeys.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              select
              size="small"
              value={newTextKey}
              onChange={e => setNewTextKey(e.target.value)}
              SelectProps={{ native: true }}
              sx={{ flex: 1 }}
            >
              <option value="">Select key</option>
              {textKeys
                .filter(k => !config.textFilters.some(tf => tf.key === k))
                .map(k => <option key={k} value={k}>{k}</option>)}
            </TextField>
            <IconButton size="small" onClick={addTextFilter} disabled={!newTextKey}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Divider />

      {/* リセット */}
      <Box sx={{ p: 1.5 }}>
        <Button
          size="small"
          variant="outlined"
          fullWidth
          onClick={() => onConfigChange({ rangeFilters: [], textFilters: [] })}
          disabled={config.rangeFilters.length === 0 && config.textFilters.length === 0}
        >
          Reset All Filters
        </Button>
      </Box>
    </Box>
  );
}
