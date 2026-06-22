/**
 * BugHistoryPanel — thin React wrapper.
 *
 * データ・hooks は持たず、VanillaIsland 経由で mountBugHistoryPanel へ委譲する。
 * MemoryPanel.tsx がこのコンポーネントを import しているため export シグネチャは変えない。
 */
import { useCallback } from 'react';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountBugHistoryPanel, type BugHistoryPanelProps as VanillaBugHistoryPanelProps } from '../../views/memory/bugHistoryPanel';
import type { MemoryReader } from '../../data/readers/MemoryReader';

export interface BugHistoryPanelProps {
  readonly reader: MemoryReader | null;
  readonly isDark?: boolean;
  readonly onOpenSessionMessages?: (sessionId: string) => void;
  readonly onOpenPrecedingReviews?: (findingIds: readonly string[]) => void;
  readonly onOpenSiblingBugs?: (bugEntityIds: readonly string[]) => void;
  readonly pendingBugFilter?: { bugEntityIds: readonly string[] } | null;
  readonly onConsumePendingBugFilter?: () => void;
}

export function BugHistoryPanel({
  reader,
  onOpenSessionMessages,
  onOpenPrecedingReviews,
  onOpenSiblingBugs,
  pendingBugFilter,
}: Readonly<BugHistoryPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();

  // vanilla view は動的キー（`memory.bug.*` 等）を string で渡すため、境界で型を緩める。
  const tStr = useCallback((key: string): string => t(key as Parameters<typeof t>[0]), [t]);

  const viewProps: VanillaBugHistoryPanelProps = {
    t: tStr,
    reader,
    onOpenSessionMessages,
    onOpenPrecedingReviews,
    onOpenSiblingBugs,
    pendingBugFilter,
  };

  return <VanillaIsland mount={mountBugHistoryPanel} props={viewProps} />;
}
