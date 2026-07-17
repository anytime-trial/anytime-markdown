export { matchCommitsToMessages, type MessageCommitMatch } from './BackfillMessageCommits';
export { computeFlightOutcome, type FlightOutcomeAggregate } from './ComputeFlightOutcome';
export { extractSelfAssessment } from './ExtractSelfAssessment';
export { detectUserFeedback, type UserFeedbackMatch } from './DetectUserFeedback';
export { extractLessonCandidates, type LessonCandidateInput } from './ExtractLessonCandidates';
export {
  checkArchitecturalAlignment,
  type AlignmentDeps,
  type AlignmentFinding,
  type AlignmentReport,
  type AlignmentStatus,
} from './CheckArchitecturalAlignment';
