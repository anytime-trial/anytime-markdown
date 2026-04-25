import { computeDeploymentFrequency } from './deploymentFrequency';
import { computeLeadTimePerLoc } from './leadTimePerLoc';
import { computeTokensPerLoc } from './tokensPerLoc';
import { computeAiFirstTrySuccessRate } from './aiFirstTrySuccessRate';
import { computeChangeFailureRate } from './changeFailureRate';
import { DEFAULT_THRESHOLDS } from './thresholds';
import type { ThresholdsConfig } from './thresholds';
import type { DateRange, QualityMetrics, UnmeasuredMetric } from './types';

export type { DateRange };

export interface QualityMetricsInputs {
  releases: Array<{ id: string; tag_date: string; commit_hashes: string[]; fix_count?: number }>;
  messages: Array<{
    uuid: string;
    created_at: string;
    role: string;
    type: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  }>;
  messageCommits: Array<{
    message_uuid: string;
    detected_at: string;
    match_confidence: string;
    commit_hash: string;
  }>;
  commits: Array<{
    hash: string;
    subject: string;
    committed_at: string;
    is_ai_assisted: boolean;
    files: string[];
    lines_added?: number;
    lines_deleted?: number;
  }>;
  previousReleases?: Array<{ id: string; tag_date: string; commit_hashes: string[]; fix_count?: number }>;
  previousMessages?: Array<{
    uuid: string;
    created_at: string;
    role: string;
    type: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  }>;
  previousMessageCommits?: Array<{
    message_uuid: string;
    detected_at: string;
    match_confidence: string;
    commit_hash: string;
  }>;
  previousCommits?: Array<{
    hash: string;
    subject: string;
    committed_at: string;
    is_ai_assisted: boolean;
    files: string[];
    lines_added?: number;
    lines_deleted?: number;
  }>;
}

const UNMEASURED: UnmeasuredMetric[] = [
  { id: 'meanTimeToRecovery', phase: 'Phase 5', reason: 'Requires flight_reviews table' },
  { id: 'taskCompletionRate', phase: 'Phase 6', reason: 'Requires task completion tracking' },
  { id: 'aiQualityEfficiencyScore', phase: 'Phase 7', reason: 'Requires quality scoring system' },
  { id: 'recoveryRate', phase: 'Phase 5+7', reason: 'Requires emergency_log and operational_metrics' },
  { id: 'autonomyIndex', phase: 'Phase 7', reason: 'Requires autonomy measurement framework' },
];

function computePreviousRange(range: DateRange): DateRange {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const duration = toMs - fromMs;
  const prevTo = new Date(fromMs - 1);
  const prevFrom = new Date(fromMs - 1 - duration);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

function selectBucket(range: DateRange): 'day' | 'week' {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const days = (toMs - fromMs) / 86_400_000;
  return days <= 14 ? 'day' : 'week';
}

export function computeQualityMetrics(
  inputs: QualityMetricsInputs,
  range: DateRange,
  thresholds: ThresholdsConfig = DEFAULT_THRESHOLDS,
): QualityMetrics {
  const previousRange = computePreviousRange(range);
  const bucket = selectBucket(range);

  const hasPrevious =
    inputs.previousReleases !== undefined ||
    inputs.previousMessages !== undefined;

  const deploymentFrequency = computeDeploymentFrequency(
    inputs.releases,
    range,
    previousRange,
    bucket,
    hasPrevious ? (inputs.previousReleases ?? []) : undefined,
    thresholds,
  );

  const leadTimeInputs = {
    messages: inputs.messages,
    messageCommits: inputs.messageCommits,
    commits: inputs.commits,
  };
  const leadTimePrevInputs = hasPrevious
    ? {
        messages: inputs.previousMessages ?? [],
        messageCommits: inputs.previousMessageCommits ?? [],
        commits: inputs.previousCommits ?? [],
      }
    : undefined;
  const leadTimePerLoc = computeLeadTimePerLoc(
    leadTimeInputs,
    range,
    previousRange,
    bucket,
    leadTimePrevInputs,
    thresholds,
  );
  const tokensPerLoc = computeTokensPerLoc(
    leadTimeInputs,
    range,
    previousRange,
    bucket,
    leadTimePrevInputs,
    thresholds,
  );

  const aiFirstTryPrevInputs = hasPrevious
    ? { commits: inputs.previousCommits ?? [] }
    : undefined;
  const aiFirstTrySuccessRate = computeAiFirstTrySuccessRate(
    { commits: inputs.commits },
    range,
    previousRange,
    bucket,
    aiFirstTryPrevInputs,
    thresholds,
  );

  const cfrPrevInputs = hasPrevious
    ? { releases: inputs.previousReleases ?? [], commits: inputs.previousCommits ?? [] }
    : undefined;
  const changeFailureRate = computeChangeFailureRate(
    { releases: inputs.releases, commits: inputs.commits },
    range,
    previousRange,
    bucket,
    cfrPrevInputs,
    thresholds,
  );

  return {
    range,
    previousRange,
    bucket,
    metrics: {
      deploymentFrequency,
      leadTimePerLoc,
      tokensPerLoc,
      aiFirstTrySuccessRate,
      changeFailureRate,
    },
    unmeasured: UNMEASURED,
  };
}
