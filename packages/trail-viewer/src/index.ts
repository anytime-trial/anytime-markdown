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
} from './parser/types';

export { parseSession } from './parser/parseSession';
export { buildMessageTree } from './parser/buildMessageTree';
export { filterMessages } from './parser/filterMessages';
export { aggregateUsage } from './parser/aggregateUsage';

export {
  createPromptEntry,
  generatePromptId,
  extractPromptName,
  extractTags,
} from './parser/promptLoader';

export { TrailViewerCore } from './components/TrailViewerCore';
export type { TrailViewerCoreProps } from './components/TrailViewerCore';

export { PromptManager } from './components/PromptManager';
export type { PromptManagerProps } from './components/PromptManager';

export { AnalyticsPanel } from './components/AnalyticsPanel';
export type { AnalyticsData, AnalyticsPanelProps } from './components/AnalyticsPanel';

export { ReleasesPanel } from './components/ReleasesPanel';
export type { ReleasesPanelProps } from './components/ReleasesPanel';

export { createEvaluation, isValidEvaluation } from './parser/evaluationStore';
export { EvaluationPanel } from './components/EvaluationPanel';

export { useTrailDataSource } from './hooks/useTrailDataSource';
export type { TrailDataSourceResult, SupabaseConfig } from './hooks/useTrailDataSource';

export type { TrailLocale } from './i18n/types';

// C4 viewer (merged from @anytime-markdown/c4-viewer)
export { getC4Colors } from './c4/c4Theme';
export type { C4ThemeColors } from './c4/c4Theme';
export { GraphCanvas } from './c4/components/GraphCanvas';
export { DsmCanvas } from './c4/components/DsmCanvas';
export { FcMapCanvas } from './c4/components/FcMapCanvas';
export { CoverageCanvas } from './c4/components/CoverageCanvas';
export { C4ElementTree } from './c4/components/C4ElementTree';
export { useC4DataSource } from './c4/hooks/useC4DataSource';
export type { AnalysisProgress } from './c4/hooks/useC4DataSource';
export { AddElementDialog, AddRelationshipDialog } from './c4/components/C4EditDialogs';
export type { ElementFormData, RelationshipFormData, ElementOption } from './c4/components/C4EditDialogs';
export { C4ViewerCore } from './c4/components/C4ViewerCore';
export type { C4ViewerCoreProps } from './c4/components/C4ViewerCore';
