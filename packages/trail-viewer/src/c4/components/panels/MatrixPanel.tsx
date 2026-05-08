import type { C4Element, C4ElementType, C4Model, ComplexityMatrix, CoverageMatrix } from '@anytime-markdown/trail-core/c4';
import { buildC4ElementById, collectDescendantIds, computeCommunityOverlay, mapFileToC4Elements } from '@anytime-markdown/trail-core/c4';
import type { CellAlign, HeaderSpan } from '@anytime-markdown/spreadsheet-core';
import { SpreadsheetGrid, createInMemorySheetAdapter, spreadsheetViewerEnMessages } from '@anytime-markdown/spreadsheet-viewer';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';

import { getC4Colors } from '../../../theme/c4Tokens';
import { getCoverageColor } from '../../c4MetricColors';
import { useCodeGraph } from '../../../hooks/useCodeGraph';
import { useHotspot } from '../../hooks/useHotspot';
import { communityColor } from '../../../components/communityColors';

// ---------------------------------------------------------------------------
// Header span helpers
// ---------------------------------------------------------------------------

function buildSpansFromKey(keys: readonly string[]): HeaderSpan[] {
  const spans: HeaderSpan[] = [];
  let currentLabel = '';
  let currentSpan = 0;
  for (const key of keys) {
    if (key === currentLabel) {
      currentSpan++;
    } else {
      if (currentSpan > 0) spans.push({ label: currentLabel, span: currentSpan });
      currentLabel = key;
      currentSpan = 1;
    }
  }
  if (currentSpan > 0) spans.push({ label: currentLabel, span: currentSpan });
  return spans;
}

// ---------------------------------------------------------------------------
// Matrix → SheetSnapshot converters
// ---------------------------------------------------------------------------

function buildCoverageBreadcrumb(
  elementId: string,
  level: 'package' | 'component' | 'code',
  elementById: ReadonlyMap<string, C4Element>,
): string {
  const el = elementById.get(elementId);
  if (!el) return elementId;
  if (level === 'package') return el.name;
  if (level === 'component') {
    const container = el.boundaryId ? elementById.get(el.boundaryId) : null;
    return container ? `${container.name} / ${el.name}` : el.name;
  }
  // code
  const component = el.boundaryId ? elementById.get(el.boundaryId) : null;
  const container = component?.boundaryId ? elementById.get(component.boundaryId) : null;
  return [container?.name, component?.name, el.name].filter(Boolean).join(' / ');
}

function coverageToSheet(
  matrix: CoverageMatrix,
  model: C4Model,
  complexityMatrix: ComplexityMatrix | null,
  churnCountMap: ReadonlyMap<string, number> | null,
) {
  const elementById = new Map(model.elements.map(e => [e.id, e]));
  const complexityMap = new Map(complexityMatrix?.entries.map(e => [e.elementId, e.totalCount]) ?? []);
  const headerRow = ['Component', 'Lines%', 'Branches%', 'Functions%', 'Complexity', 'LOC', 'Commits'];
  const dataRows = matrix.entries.map(e => {
    const complexity = complexityMap.get(e.elementId);
    const commits = churnCountMap?.get(e.elementId);
    return [
      elementById.get(e.elementId)?.name ?? e.elementId,
      String(Math.round(e.lines.pct * 10) / 10),
      String(Math.round(e.branches.pct * 10) / 10),
      String(Math.round(e.functions.pct * 10) / 10),
      complexity != null ? String(complexity) : '',
      e.lines.total > 0 ? String(e.lines.total) : '',
      commits != null ? String(commits) : '',
    ];
  });
  const cells = [headerRow, ...dataRows];
  const alignments = cells.map(r => r.map((): CellAlign => 'right'));
  return { cells, alignments, range: { rows: cells.length, cols: 7 } };
}

const sheetT = (key: string) => (spreadsheetViewerEnMessages.Spreadsheet as Record<string, string>)[key] ?? key;

function makeSheetResult(sheet: { cells: string[][]; alignments: CellAlign[][]; range: { rows: number; cols: number } }) {
  const colHeaders = sheet.cells[0]?.slice(1) ?? [];
  const dataRows = sheet.cells.slice(1).map(r => r.slice(1));
  const dataAligns = sheet.alignments.slice(1).map(r => r.slice(1));
  const rowHeaders = sheet.cells.slice(1).map(r => r[0] ?? '');
  const cols = Math.max(0, sheet.range.cols - 1);
  const adapter = createInMemorySheetAdapter(
    { cells: dataRows, alignments: dataAligns, range: { rows: dataRows.length, cols } },
    { readOnly: true },
  );
  return { colHeaders, rowHeaders, adapter };
}

// ---------------------------------------------------------------------------

export interface MatrixPanelProps {
  readonly coverageMatrix: CoverageMatrix | null;
  readonly complexityMatrix?: ComplexityMatrix | null;
  readonly c4Model: C4Model | null;
  readonly serverUrl?: string;
  readonly selectedRepo?: string;
  readonly selectedRelease?: string;
  readonly isDark?: boolean;
  /** タブ非表示中は API フェッチを抑止する。省略時は true（後方互換）。 */
  readonly isActive?: boolean;
  /** Community 配色の有効/無効。C4 ビューの Community トグルと連動させるため外部制御する。省略時は false。 */
  readonly isCommunityColor?: boolean;
  /** マウント時の初期レベル。省略時は 'component'。 */
  readonly initialLevel?: 'package' | 'component' | 'code';
  /** 指定要素の子孫 (descendants) のみに絞り込む。省略時はフィルタなし。 */
  readonly filterElementId?: string | null;
}

export function MatrixPanel({
  coverageMatrix,
  complexityMatrix,
  c4Model,
  serverUrl,
  selectedRepo,
  selectedRelease,
  isDark = false,
  isActive = true,
  isCommunityColor = false,
  initialLevel = 'component',
  filterElementId = null,
}: Readonly<MatrixPanelProps>) {
  const colors = useMemo(() => getC4Colors(isDark), [isDark]);

  const [level, setLevel] = useState<'package' | 'component' | 'code'>(initialLevel);

  const { graph: codeGraph } = useCodeGraph(serverUrl ?? '', {
    enabled: isActive,
    release: selectedRelease,
    repo: selectedRepo,
  });

  const { data: hotspotData } = useHotspot({
    enabled: isActive && !!serverUrl,
    serverUrl,
    period: '90d',
    granularity: 'commit',
  });

  const churnCountMap = useMemo<ReadonlyMap<string, number> | null>(() => {
    if (!hotspotData?.files.length || !c4Model) return null;
    const elementById = buildC4ElementById(c4Model.elements);
    const map = new Map<string, number>();
    for (const entry of hotspotData.files) {
      for (const m of mapFileToC4Elements(entry.filePath, elementById)) {
        map.set(m.elementId, (map.get(m.elementId) ?? 0) + entry.churn);
      }
    }
    return map.size > 0 ? map : null;
  }, [hotspotData, c4Model]);

  const filterScopeIds = useMemo<ReadonlySet<string> | null>(() => {
    if (!filterElementId || !c4Model) return null;
    const ids = collectDescendantIds(c4Model.elements, filterElementId);
    return ids.size > 0 ? ids : null;
  }, [filterElementId, c4Model]);

  const filteredCoverageMatrix = useMemo(() => {
    if (!coverageMatrix || !c4Model) return coverageMatrix;
    const typeFilter: Set<C4ElementType> =
      level === 'package' ? new Set(['container', 'containerDb']) :
      level === 'code'    ? new Set(['code']) :
                               new Set(['component']);
    let validIds = new Set(c4Model.elements.filter(e => typeFilter.has(e.type)).map(e => e.id));
    if (filterScopeIds) {
      validIds = new Set([...validIds].filter(id => filterScopeIds.has(id)));
    }
    const elementById = new Map(c4Model.elements.map(e => [e.id, e]));
    const entries = coverageMatrix.entries
      .filter(e => validIds.has(e.elementId))
      .sort((a, b) =>
        buildCoverageBreadcrumb(a.elementId, level, elementById)
          .localeCompare(buildCoverageBreadcrumb(b.elementId, level, elementById)),
      );
    return { ...coverageMatrix, entries };
  }, [coverageMatrix, c4Model, level, filterScopeIds]);

  const communityColorByElement = useMemo(() => {
    if (!codeGraph || !c4Model) return null;
    const overlay = computeCommunityOverlay(c4Model, codeGraph, 3, selectedRepo ?? null);
    if (!overlay || overlay.size === 0) return null;
    const map = new Map<string, string>();
    for (const [elementId, entry] of overlay) {
      map.set(elementId, communityColor(entry.dominantCommunity));
    }
    return map;
  }, [codeGraph, c4Model, selectedRepo]);

  const coverageResult = useMemo(
    () => filteredCoverageMatrix && c4Model
      ? makeSheetResult(coverageToSheet(filteredCoverageMatrix, c4Model, complexityMatrix ?? null, churnCountMap))
      : null,
    [filteredCoverageMatrix, c4Model, complexityMatrix, churnCountMap],
  );

  const activeAdapter = coverageResult?.adapter ?? null;
  const activeColHeaders = coverageResult?.colHeaders;
  const activeRowHeaders = coverageResult?.rowHeaders;

  const gridDimensions = useMemo(() => {
    if (!activeAdapter) return { rows: 51, cols: 15 };
    const snap = activeAdapter.getSnapshot();
    return { rows: snap.range.rows, cols: snap.range.cols };
  }, [activeAdapter]);

  // Coverage ビュー: L3=コンテナ列、L4=コンテナ列+コンポーネント列
  const coverageRowHeaderGroups = useMemo(() => {
    if (level === 'package' || !filteredCoverageMatrix || !c4Model) return undefined;
    const elementById = new Map(c4Model.elements.map(e => [e.id, e]));
    const entries = filteredCoverageMatrix.entries;
    if (level === 'component') {
      const containerKeys = entries.map(e => {
        const el = elementById.get(e.elementId);
        return (el?.boundaryId ? elementById.get(el.boundaryId)?.name : undefined) ?? '';
      });
      return [buildSpansFromKey(containerKeys)];
    }
    // code: コンテナ列 + コンポーネント列
    const containerKeys = entries.map(e => {
      const el = elementById.get(e.elementId);
      const comp = el?.boundaryId ? elementById.get(el.boundaryId) : null;
      return (comp?.boundaryId ? elementById.get(comp.boundaryId)?.name : undefined) ?? '';
    });
    const componentKeys = entries.map(e => {
      const el = elementById.get(e.elementId);
      return (el?.boundaryId ? elementById.get(el.boundaryId)?.name : undefined) ?? '';
    });
    return [buildSpansFromKey(containerKeys), buildSpansFromKey(componentKeys)];
  }, [level, filteredCoverageMatrix, c4Model]);

  // Coverage ビュー: 行ヘッダーにコミュニティ色
  const coverageRowHeaderBackground = useMemo(() => {
    if (!communityColorByElement || !filteredCoverageMatrix) return undefined;
    const entries = filteredCoverageMatrix.entries;
    return (rowIndex: number) => communityColorByElement.get(entries[rowIndex]?.elementId ?? '');
  }, [communityColorByElement, filteredCoverageMatrix]);

  // Coverage ビュー: セルを coverage overlay 色（Lines/Branches/Functions 共通の閾値）で塗りつぶし
  const coverageCellBackground = useMemo(() => {
    if (!coverageMatrix) return undefined;
    return (_row: number, col: number, value: string): string | undefined => {
      if (col > 2) return undefined; // Lines%/Branches%/Functions% のみ色付け
      const pct = Number.parseFloat(value);
      if (Number.isNaN(pct)) return undefined;
      return getCoverageColor(pct) + '55';
    };
  }, [coverageMatrix]);

  const toolbarButtonSx = {
    textTransform: 'none' as const,
    color: colors.accent,
    borderColor: colors.border,
    fontSize: '0.75rem',
    '&:hover': { bgcolor: colors.hover },
    '&:focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: '2px' },
    '&:disabled': { color: colors.textMuted },
  };
  const toolbarButtonActiveBg = colors.focus;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: colors.bg }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: `1px solid ${colors.border}`, flexShrink: 0, flexWrap: 'wrap' }}>
        <ButtonGroup size="small">
          {(['package', 'component', 'code'] as const).map((lv) => (
            <Button
              key={lv}
              size="small"
              aria-pressed={level === lv}
              onClick={() => setLevel(lv)}
              sx={{ ...toolbarButtonSx, ...(level === lv && { bgcolor: toolbarButtonActiveBg }) }}
            >
              {lv === 'package' ? 'C2' : lv === 'component' ? 'C3' : 'C4'}
            </Button>
          ))}
        </ButtonGroup>
      </Box>

      {/* Sheet */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {activeAdapter ? (
          <SpreadsheetGrid
            key={`coverage-${level}`}
            adapter={activeAdapter}
            isDark={isDark}
            t={sheetT}
            showApply={false}
            showRange={false}
            showToolbar={false}
            columnHeaders={activeColHeaders}
            rowHeaders={activeRowHeaders}
            rowHeaderWidth={
              level === 'code'      ? 280 :
              level === 'component' ? 200 :
              120
            }
            rowHeaderGroups={coverageRowHeaderGroups}
            gridRows={gridDimensions.rows}
            gridCols={gridDimensions.cols}
            getCellBackground={coverageCellBackground}
            getRowHeaderBackground={isCommunityColor ? coverageRowHeaderBackground : undefined}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              Import a C4 model to view metrics
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
