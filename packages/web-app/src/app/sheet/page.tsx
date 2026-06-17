'use client';

import {
  createInMemoryWorkbookAdapter,
  mountSpreadsheetEditor,
  type SpreadsheetEditorHandle,
  type ChartDefinition,
} from '@anytime-markdown/spreadsheet-viewer';
import { Box } from '@mui/material';
import { useEffect, useMemo, useRef } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';

/** localStorage キー: チャート定義の永続化。 */
const CHARTS_STORAGE_KEY = 'anytime-sheet-charts';

/** localStorage からチャート定義を読む。失敗時は [] を返す。 */
function readChartsFromStorage(): ChartDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CHARTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as ChartDefinition[];
    return [];
  } catch (err: unknown) {
    console.error('[SheetPage] charts read from localStorage failed', err);
    return [];
  }
}

/** チャート定義を localStorage に書き込む。 */
function writeChartsToStorage(charts: ChartDefinition[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHARTS_STORAGE_KEY, JSON.stringify(charts));
  } catch (err: unknown) {
    console.error('[SheetPage] charts write to localStorage failed', err);
  }
}

/**
 * spreadsheet-viewer の脱 React に伴い、vanilla の mountSpreadsheetEditor を
 * useEffect で mount する（VanillaMarkdownEditorMount と同じ配線パターン）。
 * themeMode は handle.update で live 反映、locale 変更は再 mount（t 差し替え）。
 * チャート定義は localStorage（`anytime-sheet-charts`）に永続化する。
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
    const initialCharts = readChartsFromStorage();
    const handle = mountSpreadsheetEditor(container, {
      themeMode: themeModeRef.current,
      locale,
      workbookAdapter,
      initialCharts,
      onChartsChange: (charts) => {
        writeChartsToStorage(charts);
      },
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
