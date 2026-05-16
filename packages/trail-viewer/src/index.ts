// trail-viewer — Claude Code conversation trace viewer
export type {
  TrailSession,
  TrailMessage,
  TrailToolCall,
  TrailTokenUsage,
  TrailTreeNode,
  TrailFilter,
  TrailPromptEntry,
  TrailEvaluation,
  TrailSessionCommit,
  ToolMetrics,
} from './domain/parser/types';

export { buildMessageTree } from './domain/parser/buildMessageTree';
export { filterMessages } from './domain/parser/filterMessages';
export { aggregateUsage } from './domain/parser/aggregateUsage';

export {
  createPromptEntry,
  generatePromptId,
  extractPromptName,
  extractTags,
} from './domain/parser/promptLoader';

export { TrailViewerCore } from './components/TrailViewerCore';
export type { TrailViewerCoreProps } from './components/TrailViewerCore';

export { TrailViewerApp } from './components/TrailViewerApp';
export type { TrailViewerAppProps } from './components/TrailViewerApp';

export { PromptManager } from './components/PromptManager';
export type { PromptManagerProps } from './components/PromptManager';

export { AnalyticsPanel } from './components/AnalyticsPanel';
export type { AnalyticsPanelProps } from './components/AnalyticsPanel';
export type { AnalyticsData } from './domain/parser/types';

export { ReleasesPanel } from './components/ReleasesPanel';
export type { ReleasesPanelProps } from './components/ReleasesPanel';

export { createEvaluation, isValidEvaluation } from './domain/parser/evaluationStore';
export { EvaluationPanel } from './components/EvaluationPanel';

export { useTrailDataSource } from './hooks/useTrailDataSource';
export { useTraceFiles } from './hooks/useTraceFiles';
export type { TraceFileListing } from './hooks/useTraceFiles';
export type { TrailDataSourceResult } from './hooks/useTrailDataSource';
export { SupabaseTrailReader } from './hooks/SupabaseTrailReader';
// SupabaseC4ModelStore は server-safe 用に '@anytime-markdown/trail-viewer/supabase' から import する

export type { TrailLocale } from './i18n/types';

// C4 viewer (merged from @anytime-markdown/c4-viewer)
export { getC4Colors } from './theme/c4Tokens';
export type { C4ThemeColors } from './theme/c4Tokens';
export { GraphCanvas } from './c4/components/canvases/GraphCanvas';
export { DsmCanvas } from './c4/components/canvases/DsmCanvas';
export { FcMapCanvas } from './c4/components/canvases/FcMapCanvas';
export { CoverageCanvas } from './c4/components/canvases/CoverageCanvas';
export { C4ElementTree } from './c4/components/panels/C4ElementTree';
export { useC4DataSource } from './c4/hooks/useC4DataSource';
export type { AnalysisProgress } from './c4/hooks/useC4DataSource';
export { AddElementDialog, AddRelationshipDialog } from './c4/components/dialogs/C4EditDialogs';
export type { ElementFormData, RelationshipFormData, ElementOption } from './c4/components/dialogs/C4EditDialogs';
export { C4ViewerCore } from './c4/components/C4ViewerCore';
export type { C4ViewerCoreProps } from './c4/components/C4ViewerCore';
