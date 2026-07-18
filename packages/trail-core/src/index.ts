export type { TrailGraph } from './model/types';
export { trailToC4 } from './transform/toC4';
export { codeGraphToC4 } from './c4/codeGraphToC4';
export { formatLocalDate, formatLocalTime, formatLocalDateTime, toLocalDateKey } from './formatDate';
export type {
  AlignmentInput,
  AlignmentOptions,
  AlignmentScope,
  ChangedFile,
  IFileChangeResolver,
} from './domain/port/IFileChangeResolver';
export type { ISpecDocIndex, SpecDocRef } from './domain/port/ISpecDocIndex';

// Domain layer
export * from './domain';

export type { ManualElement, ManualRelationship, ManualGroup, IManualElementProvider } from './c4/manualTypes';
export { mergeManualIntoC4Model } from './c4/mergeManual';
export type { C4Model } from './c4/types';

export type { ServiceEntry } from './c4/services/catalog';
// SERVICE_CATALOG / findService / filterServices は serviceIcons.generated.ts
// (simple-icons から抽出した約 79 KiB のアイコンデータ) を取り込む UI 専用定数。
// 専用 subpath '@anytime-markdown/trail-core/c4/services' からのみ import 可能とし、
// main index からは値 export しない (共通 barrel に UI 用の重い定数を載せないため)。

export { computeTemporalCoupling } from './temporalCoupling/computeTemporalCoupling';
export { computeSessionCoupling } from './temporalCoupling/computeSessionCoupling';
export { computeSubagentTypeCoupling } from './temporalCoupling/computeSubagentTypeCoupling';
export { computeConfidenceCoupling } from './temporalCoupling/computeConfidenceCoupling';
export { computeSessionConfidenceCoupling } from './temporalCoupling/computeSessionConfidenceCoupling';
export { computeSubagentTypeConfidenceCoupling } from './temporalCoupling/computeSubagentTypeConfidenceCoupling';
export type {
  CommitFileRow,
  SessionFileRow,
  SubagentTypeFileRow,
  GroupedFileRow,
  ComputeTemporalCouplingOptions,
  TemporalCouplingEdge,
  ComputeConfidenceCouplingOptions,
  ConfidenceCouplingEdge,
  CouplingDirection,
} from './temporalCoupling/types';

export {
  computeDefectRisk,
  type CommitRiskRow,
  type DefectRiskEntry,
  type ComputeDefectRiskOptions,
} from './defectRisk';

export {
  aggregateDriftByDay,
  type AggregateDriftByDayOptions,
  type DriftEventTimes,
  type DriftHistoryPoint,
} from './drift';

export {
  computeBusFactor,
  normalizeAuthor,
  type BusFactorEntry,
  type ComputeBusFactorOptions,
  type FileAuthorCommitRow,
} from './busFactor';
