'use client';

import { useState, useRef, useCallback } from 'react';
import type { ElementDefinition } from 'cytoscape';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import MuiLink from '@mui/material/Link';
import {
  CytoscapeCanvas,
  type CytoscapeCanvasRef,
} from '../../components/CytoscapeCanvas';
import { defaultStylesheetJsonBlock } from '../../components/sampleData';
import { DataInput } from './DataInput';

const LAYOUT_OPTIONS = ['cose', 'breadthfirst', 'circle', 'concentric', 'grid'] as const;

export function ViewerBody() {
  const [elements, setElements] = useState<ElementDefinition[] | null>(null);
  const [layoutName, setLayoutName] = useState('cose');
  const [dataKey, setDataKey] = useState(0);
  const cyRef = useRef<CytoscapeCanvasRef>(null);

  const handleDataChange = useCallback((newElements: ElementDefinition[]) => {
    setElements(newElements);
    setDataKey((prev) => prev + 1);
  }, []);

  const handleLayoutChange = useCallback((name: string) => {
    setLayoutName(name);
    const cy = cyRef.current?.getCy();
    if (cy) {
      cy.layout({ name } as import('cytoscape').LayoutOptions).run();
    }
  }, []);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={Link} href="/cytoscape" underline="hover" color="inherit">
          Cytoscape.js
        </MuiLink>
        <Typography color="text.primary">Data Viewer</Typography>
      </Breadcrumbs>

      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
        Data Viewer
      </Typography>

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 3,
          mb: 3,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <DataInput onDataChange={handleDataChange} />
        </Box>
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel id="layout-select-label">Layout</InputLabel>
          <Select
            labelId="layout-select-label"
            value={layoutName}
            label="Layout"
            onChange={(e) => handleLayoutChange(e.target.value)}
          >
            {LAYOUT_OPTIONS.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box
        sx={{
          minHeight: 500,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {elements ? (
          <CytoscapeCanvas
            key={dataKey}
            ref={cyRef}
            elements={elements}
            stylesheet={defaultStylesheetJsonBlock}
            layout={{ name: layoutName } as import('cytoscape').LayoutOptions}
            sx={{ width: '100%', height: '100%', minHeight: 500 }}
          />
        ) : (
          <Typography color="text.secondary">Load data to visualize</Typography>
        )}
      </Box>
    </Box>
  );
}
