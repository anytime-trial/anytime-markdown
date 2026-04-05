import type {
  BoundaryInfo,
  C4Model,
  CyclicPair,
  DsmDiff,
  DsmMatrix,
} from '@anytime-markdown/c4-kernel';

// ---------------------------------------------------------------------------
//  Server → Client messages
// ---------------------------------------------------------------------------

export interface ModelUpdatedMessage {
  readonly type: 'model-updated';
  readonly model: C4Model;
  readonly boundaries: readonly BoundaryInfo[];
}

export interface DsmMatrixUpdatedMessage {
  readonly type: 'dsm-updated';
  readonly matrix: DsmMatrix;
}

export interface DsmDiffUpdatedMessage {
  readonly type: 'dsm-updated';
  readonly diff: DsmDiff;
  readonly cycles: readonly CyclicPair[];
}

export type DsmUpdatedMessage = DsmMatrixUpdatedMessage | DsmDiffUpdatedMessage;

export type ServerMessage = ModelUpdatedMessage | DsmUpdatedMessage;

// ---------------------------------------------------------------------------
//  Client → Server messages
// ---------------------------------------------------------------------------

export interface SetLevelCommand {
  readonly type: 'set-level';
  readonly level: 'component' | 'package';
}

export interface SetDsmModeCommand {
  readonly type: 'set-dsm-mode';
  readonly mode: 'c4' | 'diff';
}

export interface ClusterCommand {
  readonly type: 'cluster';
  readonly enabled: boolean;
}

export interface RefreshCommand {
  readonly type: 'refresh';
}

export type ClientMessage =
  | SetLevelCommand
  | SetDsmModeCommand
  | ClusterCommand
  | RefreshCommand;
