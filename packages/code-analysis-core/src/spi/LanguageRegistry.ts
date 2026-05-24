import type { LanguageAnalyzer } from './LanguageAnalyzer';

/** 言語アナライザの登録簿。合成ルートで register し、検出・解決に使う。 */
export class LanguageRegistry {
  private readonly analyzers = new Map<string, LanguageAnalyzer>();

  register(analyzer: LanguageAnalyzer): void {
    if (this.analyzers.has(analyzer.id)) {
      throw new Error(`LanguageAnalyzer '${analyzer.id}' already registered`);
    }
    this.analyzers.set(analyzer.id, analyzer);
  }

  get(id: string): LanguageAnalyzer | undefined {
    return this.analyzers.get(id);
  }

  list(): LanguageAnalyzer[] {
    return [...this.analyzers.values()];
  }

  /** repoRoot で detect() が true を返すアナライザを登録順に返す。 */
  detectAll(repoRoot: string): LanguageAnalyzer[] {
    return this.list().filter((a) => a.detect(repoRoot));
  }
}
