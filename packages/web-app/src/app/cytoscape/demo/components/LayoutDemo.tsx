'use client';

import { useRef, useState } from 'react';
import type { LayoutOptions } from 'cytoscape';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import {
  CytoscapeCanvas,
  type CytoscapeCanvasRef,
} from '../../components/CytoscapeCanvas';
import {
  socialNetworkData,
  defaultStylesheetJsonBlock,
} from '../../components/sampleData';

const LAYOUTS = ['cose', 'breadthfirst', 'circle', 'concentric', 'grid'] as const;

export function LayoutDemo() {
  const cyRef = useRef<CytoscapeCanvasRef>(null);
  const [selected, setSelected] = useState<string>('cose');

  const handleLayoutChange = (name: string) => {
    setSelected(name);
    cyRef.current
      ?.getCy()
      ?.layout({ name, animate: true, animationDuration: 500 } as LayoutOptions)
      .run();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {LAYOUTS.map(name => (
          <Chip
            key={name}
            label={name}
            color={selected === name ? 'primary' : 'default'}
            variant={selected === name ? 'filled' : 'outlined'}
            onClick={() => handleLayoutChange(name)}
          />
        ))}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 500 }}>
        <CytoscapeCanvas
          ref={cyRef}
          elements={socialNetworkData}
          stylesheet={defaultStylesheetJsonBlock}
          layout={{ name: 'cose' }}
        />
      </Box>
    </Box>
  );
}
