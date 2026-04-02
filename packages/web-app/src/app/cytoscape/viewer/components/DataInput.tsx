'use client';

import { useState, useRef, useCallback } from 'react';
import type { ElementDefinition } from 'cytoscape';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import {
  socialNetworkData,
  orgChartData,
  flowChartData,
  dependencyGraphData,
} from '../../components/sampleData';

interface DataInputProps {
  readonly onDataChange: (elements: ElementDefinition[]) => void;
}

const SAMPLE_OPTIONS = [
  { label: 'Social Network', data: socialNetworkData },
  { label: 'Organization Chart', data: orgChartData },
  { label: 'Flow Chart', data: flowChartData },
  { label: 'Dependency Graph', data: dependencyGraphData },
] as const;

function parseAndValidate(text: string): ElementDefinition[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON must be an array of ElementDefinition objects');
  }
  return parsed as ElementDefinition[];
}

export function DataInput({ onDataChange }: Readonly<DataInputProps>) {
  const [tabIndex, setTabIndex] = useState(0);
  const [textValue, setTextValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sampleKey, setSampleKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRender = useCallback(() => {
    setError(null);
    try {
      const elements = parseAndValidate(textValue);
      onDataChange(elements);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse JSON');
    }
  }, [textValue, onDataChange]);

  const handleFileContent = useCallback(
    (content: string, name: string) => {
      setError(null);
      try {
        const elements = parseAndValidate(content);
        setFileName(name);
        onDataChange(elements);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse JSON');
        setFileName(null);
      }
    },
    [onDataChange],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleFileContent(reader.result, file.name);
        }
      };
      reader.readAsText(file);
    },
    [handleFileContent],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleFileContent(reader.result, file.name);
        }
      };
      reader.readAsText(file);
    },
    [handleFileContent],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleSampleSelect = useCallback(
    (value: string) => {
      setSampleKey(value);
      setError(null);
      const option = SAMPLE_OPTIONS.find((o) => o.label === value);
      if (option) {
        onDataChange([...option.data]);
      }
    },
    [onDataChange],
  );

  return (
    <Box>
      <Tabs value={tabIndex} onChange={(_, v: number) => setTabIndex(v)} sx={{ mb: 2 }}>
        <Tab label="Text Input" />
        <Tab label="File Upload" />
        <Tab label="Sample Data" />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {tabIndex === 0 && (
        <Box>
          <TextField
            multiline
            rows={10}
            fullWidth
            placeholder='[{"data": {"id": "a", "label": "Node A"}}, ...]'
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            slotProps={{
              input: { sx: { fontFamily: 'monospace', fontSize: 13 } },
            }}
            sx={{ mb: 2 }}
          />
          <Button variant="contained" onClick={handleRender}>
            Render
          </Button>
        </Box>
      )}

      {tabIndex === 1 && (
        <Box>
          <Box
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            sx={{
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              p: 4,
              textAlign: 'center',
              mb: 2,
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Typography color="text.secondary">
              Drop a JSON file here or click to choose
            </Typography>
            {fileName && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Loaded: {fileName}
              </Typography>
            )}
          </Box>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            hidden
            onChange={handleFileChange}
          />
          <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
            Choose File
          </Button>
        </Box>
      )}

      {tabIndex === 2 && (
        <FormControl fullWidth>
          <InputLabel id="sample-select-label">Sample Dataset</InputLabel>
          <Select
            labelId="sample-select-label"
            value={sampleKey}
            label="Sample Dataset"
            onChange={(e) => handleSampleSelect(e.target.value)}
          >
            {SAMPLE_OPTIONS.map((option) => (
              <MenuItem key={option.label} value={option.label}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Box>
  );
}
