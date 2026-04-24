'use client';

import { createInMemoryWorkbookAdapter } from '@anytime-markdown/spreadsheet-viewer';
import { Box } from '@mui/material';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useThemeMode } from '../providers';

const SpreadsheetEditor = dynamic(
  () => import('@anytime-markdown/spreadsheet-viewer').then(m => ({ default: m.SpreadsheetEditor })),
  { ssr: false },
);

export default function SheetPage() {
  const { themeMode } = useThemeMode();
  const workbookAdapter = useMemo(() => createInMemoryWorkbookAdapter(), []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <LandingHeader />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SpreadsheetEditor themeMode={themeMode} workbookAdapter={workbookAdapter} />
      </Box>
    </Box>
  );
}
