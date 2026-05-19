import type { Analyzer } from './types';

/**
 * `dependsOn` に基づき analyzer 群を安定トポロジカルソートする。
 *
 * - 依存は同じ集合内の analyzer id を指す。集合外 (別 Wave / 未登録) の id は無視する。
 * - 依存関係のない analyzer 間は**入力順を保持**する (deterministic)。
 * - 循環依存を検出した場合は {@link Error} を throw する。
 *
 * Wave 3 (memory) の実行順制御に使う。例: Drift は全 content analyzer の後、
 * EmbeddingBackfill は全 analyzer の後に並ぶ。
 */
export function topoSortByDependsOn<T extends Pick<Analyzer, 'id' | 'dependsOn'>>(
  analyzers: readonly T[],
): T[] {
  const byId = new Map<string, T>(analyzers.map((a) => [a.id, a]));
  const result: T[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = (a: T): void => {
    if (done.has(a.id)) return;
    if (visiting.has(a.id)) {
      throw new Error(`Cyclic dependsOn detected at analyzer "${a.id}"`);
    }
    visiting.add(a.id);
    for (const depId of a.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (dep) visit(dep); // 集合内にない依存 (別 Wave / 未登録) は無視
    }
    visiting.delete(a.id);
    done.add(a.id);
    result.push(a);
  };

  for (const a of analyzers) visit(a);
  return result;
}
