import { entityId } from '../../canonical/entityId';
import type { BugCategory, FixCommitParseResult } from './parseFixCommit';

export interface BugEntityRow {
  id: string;
  type: 'Bug';
  canonical_name: string;
  display_name: string;
  aliases_json: string;
  tags_json: string;
  attributes_json: string;
  summary: string;
  embedding: null;
  first_seen_at: string;
  last_updated_at: string;
  recorded_at: string;
}

export interface BuildBugEntityInput {
  commitSha: string;
  parsed: FixCommitParseResult;
  committedAt: string;
  affectedFilePaths: string[];
  introducedCommitSha: string | null;
  recordedAt: string;
}

function severityFromCategory(category: BugCategory): 'error' | 'warn' | 'info' {
  if (category === 'regression') return 'error';
  if (category === 'spec' || category === 'logic') return 'warn';
  return 'info';
}

export function buildBugEntity(input: BuildBugEntityInput): BugEntityRow {
  const { commitSha, parsed, committedAt, affectedFilePaths, introducedCommitSha, recordedAt } =
    input;
  const id = entityId('Bug', commitSha);
  const severity = severityFromCategory(parsed.category);
  const attributes = {
    category: parsed.category,
    severity,
    introduced_commit: introducedCommitSha,
    fixed_commit: commitSha,
    affected_file_paths: affectedFilePaths,
    package: parsed.package,
  };
  return {
    id,
    type: 'Bug',
    canonical_name: commitSha,
    display_name: parsed.subject_summary,
    aliases_json: '[]',
    tags_json: '[]',
    attributes_json: JSON.stringify(attributes),
    summary: parsed.subject_summary.slice(0, 200),
    embedding: null,
    first_seen_at: committedAt,
    last_updated_at: recordedAt,
    recorded_at: recordedAt,
  };
}
