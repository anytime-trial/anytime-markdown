'use client';

import {
  createInMemoryWorkbookAdapter,
  mountSpreadsheetEditor,
  type SpreadsheetEditorHandle,
} from '@anytime-markdown/spreadsheet-viewer';
import { Box } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';

/**
 * spreadsheet-viewer の脱 React に伴い、vanilla の mountSpreadsheetEditor を
 * useEffect で mount する（VanillaMarkdownEditorMount と同じ配線パターン）。
 * themeMode は handle.update で live 反映、locale 変更は再 mount（t 差し替え）。
 */
export default function SheetPage() {
  const { themeMode } = useThemeMode();
  const { locale } = useLocaleSwitch();
  const workbookAdapter = useMemo(() => createInMemoryWorkbookAdapter(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SpreadsheetEditorHandle | null>(null);
  const themeModeRef = useRef(themeMode);
  themeModeRef.current = themeMode;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handle = mountSpreadsheetEditor(container, {
      themeMode: themeModeRef.current,
      locale,
      workbookAdapter,
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.destroy();
    };
  }, [locale, workbookAdapter]);

  useEffect(() => {
    handleRef.current?.update({ themeMode });
  }, [themeMode]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <LandingHeader />
      <Box ref={containerRef} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} />
    </Box>
  );
}
