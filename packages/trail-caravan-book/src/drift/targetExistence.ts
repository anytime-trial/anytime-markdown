import path from 'node:path';

import type { DriftEventInput } from './report';
import type { CaravanLogger } from '../logger';

export interface PartitionedCandidates {
  /** 実在確認を通過した（または判定材料が無く fail-open で残した）候補。 */
  kept: DriftEventInput[];
  /** 対象ファイルが消滅していた候補。イベントとしては挿入せず、既存分は解決へ回す。 */
  missingTarget: DriftEventInput[];
}

/**
 * 候補の detail から対象ファイルパスを取り出す。
 * recurring_review_finding は `file_path`、review_unfixed 系は `target_file_path` を持つ。
 */
function extractTargetFilePath(candidate: DriftEventInput): string | null {
  const fp = candidate.detail['file_path'] ?? candidate.detail['target_file_path'];
  return typeof fp === 'string' && fp !== '' ? fp : null;
}

/**
 * 候補の detail から対象ファイルが属するリポジトリ（repo_name）を取り出す。
 *
 * candidate.workspace を使わないのは、あれが「レビューが行われたリポジトリ」であって
 * 対象の所在ではないため（migration 016 が workspace と target_repo を意図的に分離
 * している。docs リポジトリのレビュー文書が code リポジトリの packages/... を指摘する
 * 形が実在する）。workspace 基準で実在チェックすると、他リポジトリに実在するファイル
 * を「消滅」と誤判定し、有効な drift を静かに解決してしまう。
 */
function extractTargetRepo(candidate: DriftEventInput): string | null {
  const repo = candidate.detail['target_repo'];
  return typeof repo === 'string' && repo !== '' ? repo : null;
}

/**
 * 対象ファイルの実在で drift 候補を分離する。
 *
 * 消滅した対象を指す drift は対処のしようがなく未解決のまま滞留する
 * （パッケージ改名・ファイル削除後も、指摘レコードが検出窓に残る限り再検出され続ける）。
 * 分離した候補は reportDriftEvents が `auto: target file missing` で解決する。
 *
 * fail-open 原則: 判定材料が無いときは drift を残す。
 * - file path を持たない候補（三源比較・パス欠落の指摘）
 * - target_repo が未解決（null / クラスタ内で混在）の候補
 * - target_repo のルートを解決できない候補（この daemon が管理しない別リポジトリ）
 * - fileExists 自体の失敗（権限等）
 */
export function partitionByTargetExistence(input: {
  candidates: DriftEventInput[];
  /** リポジトリ名 (target_repo) → リポジトリルート絶対パス。不明なら null。 */
  resolveRepoRoot: (repoName: string) => string | null;
  fileExists: (absolutePath: string) => boolean;
  logger: CaravanLogger;
}): PartitionedCandidates {
  const { candidates, resolveRepoRoot, fileExists, logger } = input;
  const kept: DriftEventInput[] = [];
  const missingTarget: DriftEventInput[] = [];

  for (const candidate of candidates) {
    const filePath = extractTargetFilePath(candidate);
    const targetRepo = extractTargetRepo(candidate);
    if (filePath === null || targetRepo === null) {
      kept.push(candidate);
      continue;
    }
    const root = resolveRepoRoot(targetRepo);
    if (root === null) {
      kept.push(candidate);
      continue;
    }
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    let exists: boolean;
    try {
      exists = fileExists(absolute);
    } catch (err) {
      logger.error(
        `[partitionByTargetExistence] fileExists failed path=${absolute}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
      );
      kept.push(candidate);
      continue;
    }
    (exists ? kept : missingTarget).push(candidate);
  }

  return { kept, missingTarget };
}
