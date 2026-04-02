'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { LayoutDemo } from './LayoutDemo';
import { AlgorithmDemo } from './AlgorithmDemo';

export function DemoBody() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Breadcrumbs>
        <Link component={NextLink} href="/cytoscape" underline="hover">
          Cytoscape.js
        </Link>
        <Typography color="text.primary">Demo</Typography>
      </Breadcrumbs>

      <Typography variant="h4" component="h1">
        Demo &amp; Showcase
      </Typography>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)}>
        <Tab label="Layouts" />
        <Tab label="Algorithms" />
      </Tabs>

      {tab === 0 && <LayoutDemo />}
      {tab === 1 && <AlgorithmDemo />}
    </Box>
  );
}
