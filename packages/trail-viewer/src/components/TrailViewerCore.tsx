/**
 * TrailViewerCore — thin React wrapper.
 *
 * Resolves React context values (i18n, theme tokens, category contexts) and
 * delegates all DOM rendering to the vanilla `mountTrailViewer` via VanillaIsland.
 *
 * TrailViewerCoreProps is kept identical so all callers remain unchanged.
 */
import { useMemo } from 'react';
import type { TraceFileSource } from '@anytime-markdown/trace-viewer';
import type { SourceLocation } from '@anytime-markdown/trace-core/types';

import type {
  TrailFilter,
  TrailMessage,
  TrailPromptEntry,
  TrailSession,
} from '../domain/parser/types';
import type { CostOptimizationData } from '../domain/parser/types';
import type { AnalyticsPanelProps } from './AnalyticsPanel';
import type { AnalyticsData } from '../domain/parser/types';

import { TrailThemeProvider } from './TrailThemeContext';
import { CommitCategoryProvider } from './CommitCategoryContext';
import { ToolCategoryProvider } from './ToolCategoryContext';
import { SkillCategoryProvider } from './SkillCategoryContext';
import { useToolCategory } from './ToolCategoryContext';
import { useSkillCategory } from './SkillCategoryContext';
import { useCommitCategory } from './CommitCategoryContext';
import { getTokens } from '../theme/designTokens';
import { TrailLocaleProvider, useTrailI18n } from '../i18n';
import type { TrailLocale, TrailI18n } from '../i18n';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';

import type { C4ViewerCoreProps } from '../c4/components/C4ViewerCore';

import { VanillaIsland } from '../shared/vanillaIsland';
import { mountTrailViewer } from '../views/trailViewer';
import type { TrailViewerViewProps } from '../views/trailViewer';

/** C4-related props forwarded to the embedded C4ViewerCore. */
type C4Props = Omit<C4ViewerCoreProps, 'isDark' | 'containerHeight' | 'onShowSequence' | 'onOpenFunctionTree'>;

export interface TrailViewerCoreProps {
  readonly isDark?: boolean;
  readonly locale?: TrailLocale;
  readonly sessions: readonly TrailSession[];
  readonly allSessions?: readonly TrailSession[];
  readonly selectedSessionId?: string;
  readonly messages: readonly TrailMessage[];
  readonly filter: TrailFilter;
  readonly onSelectSession: (id: string) => void;
  readonly onFilterChange: (filter: TrailFilter) => void;
  readonly containerHeight?: string;
  readonly prompts?: readonly TrailPromptEntry[];
  readonly analytics?: AnalyticsData | null;
  readonly fetchSessionMessages?: AnalyticsPanelProps['fetchSessionMessages'];
  readonly fetchSessionCommits?: AnalyticsPanelProps['fetchSessionCommits'];
  readonly fetchSessionToolMetrics?: AnalyticsPanelProps['fetchSessionToolMetrics'];
  readonly fetchDayToolMetrics?: AnalyticsPanelProps['fetchDayToolMetrics'];
  readonly costOptimization?: CostOptimizationData | null;
  readonly releases?: readonly TrailRelease[];
  readonly fetchCombinedData?: AnalyticsPanelProps['fetchCombinedData'];
  readonly fetchQualityMetrics?: AnalyticsPanelProps['fetchQualityMetrics'];
  readonly fetchDeploymentFrequency?: AnalyticsPanelProps['fetchDeploymentFrequency'];
  readonly fetchReleaseQuality?: AnalyticsPanelProps['fetchReleaseQuality'];
  readonly sessionsLoading?: boolean;
  /** C4 viewer props. When provided, the C4 tab is shown. */
  readonly c4?: C4Props;
  /** Trace files. When provided, the Trace tab is shown. */
  readonly traceFiles?: readonly TraceFileSource[];
  /** Called when user clicks a node to jump to source. */
  readonly onJumpToSource?: (loc: SourceLocation) => void;
  /** 初期表示タブ番号（0=Analytics, 1=Messages, 2=Prompts, 4=C4, 5=Trace）*/
  readonly initialTab?: number;
  /** タブ訪問時（初期タブ含む）に呼ばれる。親側で C4 等のデータ取得を遅延起動するために使う。*/
  readonly onTabVisit?: (tab: number) => void;
  /** プロンプトポップアップ初回オープン時に呼ばれる。親側で prompts データ取得を遅延起動するために使う。*/
  readonly onPromptsOpen?: () => void;
  /**
   * WebSocket 経由でコマンドを送る関数。perf-report の送出に使う。
   * Web アプリ版では disableWebSocket=true により no-op になる。
   */
  readonly sendCommand?: (cmd: string, payload?: unknown) => void;
  /** WebSocket が接続済みか。usePerfReporter の queue flush 判定に使う。 */
  readonly wsConnected?: boolean;
  /** TrailDataServer のベース URL（Memory パネルの /api/memory/* に使用）。 */
  readonly serverUrl?: string;
  /** `.anytime/commit-categories.json` から読み込んだカテゴリマップ。省略時はデフォルトを使用。 */
  readonly commitCategories?: ReadonlyMap<string, number>;
  /** `.anytime/commit-categories.json` の categories フィールドから読み込んだラベルマップ。 */
  readonly commitCategoryLabels?: ReadonlyMap<number, string>;
  /** `.anytime/tool-categories.json` から読み込んだカテゴリマップ。省略時はデフォルトを使用。 */
  readonly toolCategories?: ReadonlyMap<string, number>;
  /** `.anytime/tool-categories.json` の categories フィールドから読み込んだラベルマップ。 */
  readonly toolCategoryLabels?: ReadonlyMap<number, string>;
  /** `.anytime/skill-categories.json` から読み込んだカテゴリマップ。省略時はデフォルトを使用。 */
  readonly skillCategories?: ReadonlyMap<string, number>;
  /** `.anytime/skill-categories.json` の categories フィールドから読み込んだラベルマップ。 */
  readonly skillCategoryLabels?: ReadonlyMap<number, string>;
}

// ---------------------------------------------------------------------------
// Inner component — has access to context hooks
// ---------------------------------------------------------------------------

function TrailViewerCoreInner(props: Readonly<TrailViewerCoreProps>) {
  const { t } = useTrailI18n();
  const tokens = useMemo(() => getTokens(props.isDark ?? true), [props.isDark]);
  const toolCategory = useToolCategory();
  const skillCategory = useSkillCategory();
  const commitCategory = useCommitCategory();

  const viewProps: TrailViewerViewProps = {
    ...props,
    t: (k: string) => t(k as keyof TrailI18n),
    tokens,
    toolCategory,
    skillCategory,
    commitCategory,
  };

  return <VanillaIsland mount={mountTrailViewer} props={viewProps} />;
}

// ---------------------------------------------------------------------------
// Public export — wraps context providers around the inner component
// ---------------------------------------------------------------------------

export function TrailViewerCore(props: Readonly<TrailViewerCoreProps>) {
  return (
    <TrailLocaleProvider locale={props.locale}>
      <TrailThemeProvider isDark={props.isDark ?? true}>
        <CommitCategoryProvider categories={props.commitCategories} categoryLabels={props.commitCategoryLabels}>
          <ToolCategoryProvider categories={props.toolCategories} categoryLabels={props.toolCategoryLabels}>
            <SkillCategoryProvider categories={props.skillCategories} categoryLabels={props.skillCategoryLabels}>
              <TrailViewerCoreInner {...props} />
            </SkillCategoryProvider>
          </ToolCategoryProvider>
        </CommitCategoryProvider>
      </TrailThemeProvider>
    </TrailLocaleProvider>
  );
}
