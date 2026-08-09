// centrality/aggregateRolesToC4.ts — Aggregate function-level role classifications to C4 element level

import type { C4Element } from '../domain/engine/c4Mapper';
import { mapFilesToC4Elements } from '../domain/engine/c4Mapper';
import type { ClassifiedFunction, FunctionRole, RoleMatrix, ElementRoleEntry } from './types';

/**
 * 同票時の優先順位: hub > orchestrator > leaf > peripheral
 */
const ROLE_PRIORITY: readonly FunctionRole[] = ['hub', 'orchestrator', 'leaf', 'peripheral'];

function makeCounts(): Record<FunctionRole, number> {
  return { hub: 0, orchestrator: 0, leaf: 0, peripheral: 0 };
}

function dominantRole(counts: Readonly<Record<FunctionRole, number>>): FunctionRole {
  let best: FunctionRole = ROLE_PRIORITY[0];
  let bestCount = counts[best];

  for (const role of ROLE_PRIORITY) {
    if (counts[role] > bestCount) {
      best = role;
      bestCount = counts[role];
    }
  }

  return best;
}

/**
 * 関数ロール分類を C4 要素 (コンポーネント/コンテナ) レベルへ集約する。
 *
 * 集約手順:
 * 1. system 型の要素を除外して mappable 要素一覧を作成する
 * 2. 各分類済み関数の filePath を配下の C4 要素にマッピングし、role をカウントする
 * 3. 関数が 0 件の要素は結果に含めない
 * 4. 最多 role を dominantRole とし、同票時は優先順位 (hub > orchestrator > leaf > peripheral) で決定する
 *
 * @param classified - 分類済み関数の一覧
 * @param elements - C4 要素の一覧
 * @returns elementId → ElementRoleEntry のマップ (関数 0 件の要素は除外)
 */
export function aggregateRolesToC4(
  classified: readonly ClassifiedFunction[],
  elements: readonly C4Element[],
): RoleMatrix {
  const mappable = elements.filter((e) => e.type !== 'system');
  const countsByElement: Record<string, Record<FunctionRole, number>> = {};

  for (const fn of classified) {
    const mappings = mapFilesToC4Elements([fn.filePath], mappable);
    // leaf-only: 最初のマッピング結果のみ使用する
    for (const m of mappings.slice(0, 1)) {
      if (!(m.elementId in countsByElement)) {
        countsByElement[m.elementId] = makeCounts();
      }
      countsByElement[m.elementId][fn.role] += 1;
    }
  }

  const result: RoleMatrix = {};

  for (const [elementId, counts] of Object.entries(countsByElement)) {
    const totalFunctions = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalFunctions === 0) continue;

    const entry: ElementRoleEntry = {
      dominantRole: dominantRole(counts),
      counts: { ...counts },
      totalFunctions,
    };
    result[elementId] = entry;
  }

  return result;
}
