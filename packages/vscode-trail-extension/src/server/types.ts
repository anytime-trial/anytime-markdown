import type {
  BoundaryInfo,
  C4Model,
  CoverageDiffMatrix,
  CoverageMatrix,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
} from '@anytime-markdown/trail-core/c4';

// ---------------------------------------------------------------------------
//  Server → Client messages
// ---------------------------------------------------------------------------

export interface ModelUpdatedMessage {
  readonly type: 'model-updated';
  readonly model: C4Model;
  readonly boundaries: readonly BoundaryInfo[];
  readonly featureMatrix?: FeatureMatrix;
}

export interface DsmUpdatedMessage {
  readonly type: 'dsm-updated';
  readonly matrix: DsmMatrix;
}

export interface AnalysisProgressMessage {
  readonly type: 'analysis-progress';
  /** 現在のフェーズ名（空文字で完了/非表示） */
  readonly phase: string;
  /** 0〜100 の進捗率（不明な場合は -1） */
  readonly percent: number;
}

export interface DocLinksUpdatedMessage {
  readonly type: 'doc-links-updated';
  readonly docLinks: readonly DocLink[];
}

export interface CoverageUpdatedMessage {
  readonly type: 'coverage-updated';
  readonly coverageMatrix: CoverageMatrix;
}

export interface CoverageDiffUpdatedMessage {
  readonly type: 'coverage-diff-updated';
  readonly coverageDiff: CoverageDiffMatrix;
}

export type ServerMessage = ModelUpdatedMessage | DsmUpdatedMessage | AnalysisProgressMessage | DocLinksUpdatedMessage | CoverageUpdatedMessage | CoverageDiffUpdatedMessage;

// ---------------------------------------------------------------------------
//  Client → Server messages
// ---------------------------------------------------------------------------

export interface SetLevelCommand {
  readonly type: 'set-level';
  readonly level: 'component' | 'package';
}

export interface ClusterCommand {
  readonly type: 'cluster';
  readonly enabled: boolean;
}

export interface RefreshCommand {
  readonly type: 'refresh';
}

// ---------------------------------------------------------------------------
//  Client → Server: editing commands
// ---------------------------------------------------------------------------

export interface AddElementCommand {
  readonly type: 'add-element';
  readonly element: {
    readonly type: 'person' | 'system';
    readonly name: string;
    readonly description?: string;
    readonly external?: boolean;
  };
}

export interface UpdateElementCommand {
  readonly type: 'update-element';
  readonly id: string;
  readonly changes: {
    readonly name?: string;
    readonly description?: string;
    readonly external?: boolean;
  };
}

export interface RemoveElementCommand {
  readonly type: 'remove-element';
  readonly id: string;
}

export interface AddRelationshipCommand {
  readonly type: 'add-relationship';
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly technology?: string;
}

export interface RemoveRelationshipCommand {
  readonly type: 'remove-relationship';
  readonly from: string;
  readonly to: string;
}

export interface PurgeDeletedElementsCommand {
  readonly type: 'purge-deleted-elements';
}

export interface OpenDocLinkCommand {
  readonly type: 'open-doc-link';
  readonly path: string;
}

export type ClientMessage =
  | SetLevelCommand
  | ClusterCommand
  | RefreshCommand
  | AddElementCommand
  | UpdateElementCommand
  | RemoveElementCommand
  | AddRelationshipCommand
  | RemoveRelationshipCommand
  | PurgeDeletedElementsCommand
  | OpenDocLinkCommand;
