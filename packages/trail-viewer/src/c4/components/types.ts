import type {
  BoundaryInfo,
  C4Model,
  C4ReleaseEntry,
  CentralityMatrix,
  ComplexityMatrix,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
  ImportanceMatrix,
  ManualGroup,
  RoleMatrix,
} from '@anytime-markdown/trail-core/c4';

import type { FileAnalysisApiEntry } from '../hooks/fetchFileAnalysisApi';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

import type { ElementFormData, RelationshipFormData } from './dialogs/C4EditDialogs';

export interface C4ViewerCoreProps {
  readonly isDark?: boolean;
  readonly c4Model: C4Model | null;
  readonly boundaries: readonly BoundaryInfo[];
  readonly featureMatrix: FeatureMatrix | null;
  readonly dsmMatrix: DsmMatrix | null;
  readonly coverageMatrix: CoverageMatrix | null;
  readonly coverageDiff: CoverageDiffMatrix | null;
  readonly complexityMatrix?: ComplexityMatrix | null;
  readonly importanceMatrix?: ImportanceMatrix | null;
  readonly deadCodeMatrix?: Record<string, number> | null;
  readonly centralityMatrix?: CentralityMatrix | null;
  readonly roleMatrix?: RoleMatrix | null;
  readonly fileAnalysisEntries?: readonly FileAnalysisApiEntry[];
  readonly functionAnalysisEntries?: readonly FunctionAnalysisApiEntry[];
  readonly docLinks?: readonly DocLink[];
  readonly connected?: boolean;
  readonly analysisProgress?: { phase: string; percent: number } | null;
  readonly onAddElement?: (data: ElementFormData) => void;
  readonly onUpdateElement?: (id: string, data: ElementFormData) => void;
  readonly onAddRelationship?: (data: RelationshipFormData) => void;
  readonly onRemoveElement?: (id: string) => void;
  readonly onPurgeDeleted?: () => void;
  readonly onDocLinkClick?: (doc: DocLink) => void;
  readonly onOpenFile?: (filePath: string) => void;
  /** L3 component 右クリックの「シーケンス表示」を選択したときのコールバック。 */
  readonly onShowSequence?: (elementId: string) => void;
  /** L3 component popup の関数一覧から「関数ツリー表示」を選択したときのコールバック。 */
  readonly onOpenFunctionTree?: (filePath: string, fnName: string, line?: number) => void;
  readonly containerHeight?: string;
  readonly releases?: readonly C4ReleaseEntry[];
  readonly selectedRelease?: string;
  readonly onReleaseSelect?: (release: string) => void;
  readonly selectedRepo?: string;
  readonly onRepoSelect?: (repo: string) => void;
  readonly serverUrl?: string;
  readonly claudeActivity?: import('../hooks/useC4DataSource').ClaudeActivityState | null;
  readonly multiAgentActivity?: import('../hooks/useC4DataSource').MultiAgentActivityState | null;
  readonly onResetClaudeActivity?: () => void;
  readonly manualGroups?: readonly ManualGroup[];
  /** 初期表示 C4 レベル（1=L1 Context, 2=L2 Container, 3=L3 Component, 4=L4 Code）*/
  readonly initialLevel?: number;
}
