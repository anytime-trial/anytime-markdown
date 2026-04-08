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
} from './parser/types';

export { parseSession } from './parser/parseSession';
export { buildMessageTree } from './parser/buildMessageTree';
export { filterMessages } from './parser/filterMessages';
export { aggregateUsage } from './parser/aggregateUsage';

export { TrailViewerCore } from './components/TrailViewerCore';
export type { TrailViewerCoreProps } from './components/TrailViewerCore';

export { useTrailDataSource } from './hooks/useTrailDataSource';
export type { TrailDataSourceResult } from './hooks/useTrailDataSource';
