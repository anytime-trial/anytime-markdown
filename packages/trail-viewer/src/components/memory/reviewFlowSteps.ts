import type { MemoryReviewHistoryRow } from '../../data/types';

export interface ReviewFlowStep {
  readonly label: string;
  readonly detail: string;
  readonly completed: boolean;
}

export function buildReviewFlowSteps(
  finding: MemoryReviewHistoryRow,
  labels: { review: string; findingLabel: string; addressed: string; notAddressed: string },
): readonly ReviewFlowStep[] {
  const steps: ReviewFlowStep[] = [
    {
      label: labels.review,
      detail: `${finding.title} (${finding.reviewedAt.slice(0, 10)})`,
      completed: true,
    },
    {
      label: labels.findingLabel,
      detail: `[${finding.category}/${finding.severity}] ${finding.findingText.slice(0, 80)}`,
      completed: true,
    },
    {
      label: finding.addressedCommitSha != null ? labels.addressed : labels.notAddressed,
      detail: finding.addressedCommitSha
        ? `${finding.addressedCommitSha.slice(0, 7)}${finding.addressedAt ? ` (${finding.addressedAt.slice(0, 10)})` : ''}`
        : '',
      completed: finding.addressedCommitSha != null,
    },
  ];
  return steps;
}
