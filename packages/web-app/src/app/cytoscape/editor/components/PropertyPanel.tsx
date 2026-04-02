'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Core } from 'cytoscape';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertyPanelProps {
  readonly selectedId: string | null;
  readonly cy: Core | null;
}

interface NodeProperties {
  label: string;
  shape: string;
  backgroundColor: string;
  width: number;
  height: number;
  borderWidth: number;
  borderColor: string;
}

interface EdgeProperties {
  label: string;
  lineColor: string;
  lineWidth: number;
  lineStyle: string;
  targetArrowShape: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 280;

const NODE_SHAPES = ['ellipse', 'rectangle', 'triangle', 'diamond', 'star', 'vee'] as const;
const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const ARROW_SHAPES = ['triangle', 'vee', 'circle', 'tee', 'none'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumericStyle(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const cleaned = value.replaceAll('px', '');
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? fallback : num;
}

function toHexColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  // Cytoscape returns rgb(...) format; convert to hex
  const rgbMatch = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(value);
  if (rgbMatch) {
    const r = Number.parseInt(rgbMatch[1], 10);
    const g = Number.parseInt(rgbMatch[2], 10);
    const b = Number.parseInt(rgbMatch[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  if (value.startsWith('#')) return value;
  return fallback;
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function ColorInput({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void }>) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" sx={{ mb: 0.5, display: 'block' }}>
        {label}
      </Typography>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', height: 36, border: 'none', cursor: 'pointer' }}
      />
    </Box>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}>) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" sx={{ mb: 0.5, display: 'block' }}>
        {label}: {value}
      </Typography>
      <Slider
        size="small"
        value={value}
        min={min}
        max={max}
        onChange={(_e, v) => onChange(v as number)}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Node property editor
// ---------------------------------------------------------------------------

function NodePropertyEditor({
  cy,
  selectedId,
}: Readonly<{ cy: Core; selectedId: string }>) {
  const [props, setProps] = useState<NodeProperties>({
    label: '',
    shape: 'ellipse',
    backgroundColor: '#666666',
    width: 30,
    height: 30,
    borderWidth: 0,
    borderColor: '#000000',
  });

  useEffect(() => {
    const ele = cy.getElementById(selectedId);
    if (ele.length === 0 || !ele.isNode()) return;
    setProps({
      label: (ele.data('label') as string) ?? '',
      shape: (ele.style('shape') as string) ?? 'ellipse',
      backgroundColor: toHexColor(ele.style('background-color') as string, '#666666'),
      width: parseNumericStyle(ele.style('width') as string, 30),
      height: parseNumericStyle(ele.style('height') as string, 30),
      borderWidth: parseNumericStyle(ele.style('border-width') as string, 0),
      borderColor: toHexColor(ele.style('border-color') as string, '#000000'),
    });
  }, [cy, selectedId]);

  const update = useCallback(
    (key: keyof NodeProperties, value: string | number) => {
      setProps(prev => ({ ...prev, [key]: value }));
      const ele = cy.getElementById(selectedId);
      if (ele.length === 0) return;

      switch (key) {
        case 'label':
          ele.data('label', value);
          break;
        case 'shape':
          ele.style('shape', value as string);
          break;
        case 'backgroundColor':
          ele.style('background-color', value as string);
          break;
        case 'width':
          ele.style('width', `${value}px`);
          break;
        case 'height':
          ele.style('height', `${value}px`);
          break;
        case 'borderWidth':
          ele.style('border-width', `${value}px`);
          break;
        case 'borderColor':
          ele.style('border-color', value as string);
          break;
      }
    },
    [cy, selectedId],
  );

  return (
    <>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Node Properties
      </Typography>
      <Divider sx={{ mb: 2 }} />

      <TextField
        label="Label"
        size="small"
        fullWidth
        value={props.label}
        onChange={e => update('label', e.target.value)}
        sx={{ mb: 2 }}
      />

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>Shape</InputLabel>
        <Select
          label="Shape"
          value={props.shape}
          onChange={e => update('shape', e.target.value)}
        >
          {NODE_SHAPES.map(s => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <ColorInput
        label="Background Color"
        value={props.backgroundColor}
        onChange={v => update('backgroundColor', v)}
      />

      <SliderField
        label="Width"
        value={props.width}
        min={20}
        max={100}
        onChange={v => update('width', v)}
      />

      <SliderField
        label="Height"
        value={props.height}
        min={20}
        max={100}
        onChange={v => update('height', v)}
      />

      <SliderField
        label="Border Width"
        value={props.borderWidth}
        min={0}
        max={5}
        onChange={v => update('borderWidth', v)}
      />

      <ColorInput
        label="Border Color"
        value={props.borderColor}
        onChange={v => update('borderColor', v)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Edge property editor
// ---------------------------------------------------------------------------

function EdgePropertyEditor({
  cy,
  selectedId,
}: Readonly<{ cy: Core; selectedId: string }>) {
  const [props, setProps] = useState<EdgeProperties>({
    label: '',
    lineColor: '#cccccc',
    lineWidth: 2,
    lineStyle: 'solid',
    targetArrowShape: 'triangle',
  });

  useEffect(() => {
    const ele = cy.getElementById(selectedId);
    if (ele.length === 0 || !ele.isEdge()) return;
    setProps({
      label: (ele.data('label') as string) ?? '',
      lineColor: toHexColor(ele.style('line-color') as string, '#cccccc'),
      lineWidth: parseNumericStyle(ele.style('width') as string, 2),
      lineStyle: (ele.style('line-style') as string) ?? 'solid',
      targetArrowShape: (ele.style('target-arrow-shape') as string) ?? 'triangle',
    });
  }, [cy, selectedId]);

  const update = useCallback(
    (key: keyof EdgeProperties, value: string | number) => {
      setProps(prev => ({ ...prev, [key]: value }));
      const ele = cy.getElementById(selectedId);
      if (ele.length === 0) return;

      switch (key) {
        case 'label':
          ele.data('label', value);
          break;
        case 'lineColor':
          ele.style('line-color', value as string);
          break;
        case 'lineWidth':
          ele.style('width', `${value}px`);
          break;
        case 'lineStyle':
          ele.style('line-style', value as string);
          break;
        case 'targetArrowShape':
          ele.style('target-arrow-shape', value as string);
          break;
      }
    },
    [cy, selectedId],
  );

  return (
    <>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Edge Properties
      </Typography>
      <Divider sx={{ mb: 2 }} />

      <TextField
        label="Label"
        size="small"
        fullWidth
        value={props.label}
        onChange={e => update('label', e.target.value)}
        sx={{ mb: 2 }}
      />

      <ColorInput
        label="Line Color"
        value={props.lineColor}
        onChange={v => update('lineColor', v)}
      />

      <SliderField
        label="Line Width"
        value={props.lineWidth}
        min={1}
        max={8}
        onChange={v => update('lineWidth', v)}
      />

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>Line Style</InputLabel>
        <Select
          label="Line Style"
          value={props.lineStyle}
          onChange={e => update('lineStyle', e.target.value)}
        >
          {LINE_STYLES.map(s => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>Target Arrow</InputLabel>
        <Select
          label="Target Arrow"
          value={props.targetArrowShape}
          onChange={e => update('targetArrowShape', e.target.value)}
        >
          {ARROW_SHAPES.map(s => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </>
  );
}

// ---------------------------------------------------------------------------
// PropertyPanel
// ---------------------------------------------------------------------------

export function PropertyPanel({ selectedId, cy }: PropertyPanelProps) {
  const renderContent = () => {
    if (!cy || selectedId === null) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          Select an element to edit its properties
        </Typography>
      );
    }

    const ele = cy.getElementById(selectedId);
    if (ele.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          Select an element to edit its properties
        </Typography>
      );
    }

    if (ele.isNode()) {
      return <NodePropertyEditor cy={cy} selectedId={selectedId} />;
    }

    return <EdgePropertyEditor cy={cy} selectedId={selectedId} />;
  };

  return (
    <Box
      sx={{
        width: PANEL_WIDTH,
        minWidth: PANEL_WIDTH,
        borderLeft: 1,
        borderColor: 'divider',
        p: 2,
        overflowY: 'auto',
      }}
    >
      {renderContent()}
    </Box>
  );
}
