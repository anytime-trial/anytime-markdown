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
 * 対象ファイルの実在で drift 候補を分離する。
 *
 * 消滅した対象を指す drift は対処のしようがなく未解決のまま滞留する
 * （パッケージ改名・ファイル削除後も、指摘レコードが検出窓に残る限り再検出され続ける）。
 * 分離した候補は reportDriftEvents が `auto: target file missing` で解決する。
 *
 * fail-open 原則: 判定材料が無いときは drift を残す。
 * - file path を持たない候補（三源比較・パス欠落の指摘）
 * - ワークスペースのルートを解決できない候補（この daemon が管理しない別リポジトリ）
 * - fileExists 自体の失敗（権限等）
 */
export function partitionByTargetExistence(input: {
  candidates: DriftEventInput[];
  /** ワークスペース名 → リポジトリルート絶対パス。不明なら null。 */
  resolveWorkspaceRoot: (workspace: string) => string | null;
  fileExists: (absolutePath: string) => boolean;
  logger: CaravanLogger;
}): PartitionedCandidates {
  const { candidates, resolveWorkspaceRoot, fileExists, logger } = input;
  const kept: DriftEventInput[] = [];
  const missingTarget: DriftEventInput[] = [];

  for (const candidate of candidates) {
    const filePath = extractTargetFilePath(candidate);
    if (filePath === null || candidate.workspace === '') {
      kept.push(candidate);
      continue;
    }
    const root = resolveWorkspaceRoot(candidate.workspace);
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
