'use client';

import {
  AddIcon,
  Box,
  Button,
  Chip,
  CloseIcon,
  DeleteIcon,
  Divider,
  IconButton,
  Slider,
  Text,
  TextField,
} from '../ui';
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
    <Box className="gv-scroll" style={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 280,
      backgroundColor: 'var(--gv-color-bg-paper)', borderRight: '1px solid var(--gv-color-divider)',
      overflowY: 'auto', zIndex: 10, display: 'flex', flexDirection: 'column',
    }}>
      <Box style={{ display: 'flex', alignItems: 'center', padding: 12, gap: 8 }}>
        <Text variant="subtitle2" style={{ flex: 1, fontWeight: 600 }}>
          Filter
        </Text>
        <IconButton size="small" onClick={onClose} aria-label="Close filter panel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Divider />

      {/* 数値範囲フィルタ */}
      <Box style={{ padding: 12 }}>
        <Text variant="caption" color="text.secondary" style={{ marginBottom: 4, display: 'block' }}>
          Range Filters
        </Text>
        {config.rangeFilters.map((rf, i) => {
          const range = keyRanges.get(rf.key);
          const min = range?.[0] ?? 0;
          const max = range?.[1] ?? 100;
          return (
            <Box key={`${rf.key}-${i}`} style={{ marginBottom: 12 }}>
              <Box style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                size="small"
                style={{ marginTop: 4 }}
              />
            </Box>
          );
        })}
        {numericKeys.length > 0 && (
          <Box style={{ display: 'flex', gap: 4 }}>
            <TextField
              select
              size="small"
              value={newRangeKey}
              onChange={e => setNewRangeKey(e.target.value)}
              fullWidth
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
      <Box style={{ padding: 12 }}>
        <Text variant="caption" color="text.secondary" style={{ marginBottom: 4, display: 'block' }}>
          Text Filters
        </Text>
        {config.textFilters.map((tf, i) => (
          <Box key={`${tf.key}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <Chip label={tf.key} size="small" />
            <TextField
              size="small"
              value={tf.value}
              onChange={e => updateTextFilter(i, e.target.value)}
              placeholder="Search..."
              fullWidth
            />
            <IconButton size="small" onClick={() => removeTextFilter(i)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {textKeys.length > 0 && (
          <Box style={{ display: 'flex', gap: 4 }}>
            <TextField
              select
              size="small"
              value={newTextKey}
              onChange={e => setNewTextKey(e.target.value)}
              fullWidth
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
      <Box style={{ padding: 12 }}>
        <Button
          size="small"
          variant="outlined"
          style={{ width: '100%' }}
          onClick={() => onConfigChange({ rangeFilters: [], textFilters: [] })}
          disabled={config.rangeFilters.length === 0 && config.textFilters.length === 0}
        >
          Reset All Filters
        </Button>
      </Box>
    </Box>
  );
}
