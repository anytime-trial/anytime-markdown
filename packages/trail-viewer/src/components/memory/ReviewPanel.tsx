/**
 * ReviewPanel — thin React wrapper.
 *
 * データ・hooks は持たず、VanillaIsland 経由で mountReviewPanel へ委譲する。
 * MemoryPanel.tsx がこのコンポーネントを import しているため export シグネチャは変えない。
 */
import { useCallback } from 'react';
import { useTrailI18n } from '../../i18n';
import { VanillaIsland } from '../../shared/vanillaIsland';
import { mountReviewPanel, type ReviewPanelProps as VanillaReviewPanelProps } from '../../views/memory/reviewPanel';
import type { MemoryReader } from '../../data/readers/MemoryReader';

export interface ReviewPanelProps {
  readonly reader: MemoryReader | null;
  readonly onOpenSessionMessages?: (sessionId: string) => void;
  readonly onOpenPrecedingBugs?: (bugEntityIds: readonly string[]) => void;
  readonly pendingReviewFilter?: { findingEntityIds: readonly string[] } | null;
}

export function ReviewPanel({
  reader,
  onOpenSessionMessages,
  onOpenPrecedingBugs,
  pendingReviewFilter,
}: Readonly<ReviewPanelProps>): React.ReactElement {
  const { t } = useTrailI18n();

  // vanilla view は動的キー（`memory.review.*` 等）を string で渡すため、境界で型を緩める。
  const tStr = useCallback((key: string): string => t(key as Parameters<typeof t>[0]), [t]);

  const viewProps: VanillaReviewPanelProps = {
    t: tStr,
    reader,
    onOpenSessionMessages,
    onOpenPrecedingBugs,
    pendingReviewFilter,
  };

  return <VanillaIsland mount={mountReviewPanel} props={viewProps} />;
}
