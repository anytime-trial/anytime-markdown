import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/trail-caravan-book';

const AGENT_META_RE = /^agent-(.+)\.meta\.json$/;

export interface MetaJsonIngesterOptions {
  /**
   * Claude Code セッションログの探索元 (lep.json `sources.claude.projectsDir` / テスト上書き)。
   * JsonlIngester と同一の projects dir を読むため、同じ値を渡して整合させる。
   * 省略時は `os.homedir()/.claude/projects`。
   */
  readonly claudeProjectsDir?: string;
}

/**
 * Layer 1 Ingester: `~/.claude/projects/<project>/<sessionId>/subagents/agent-<agentId>.meta.json`
 * を発見し `meta_json` event を emit する。
 *
 * Step 2a 時点では subscriber が不在。Step 2d の `SubagentTypeBackfiller` が購読して
 * `messages.subagent_type` 列を埋める。
 *
 * meta.json のパースは Ingester 内で行い、`agentType` が文字列で存在するもののみ emit する。
 * 既存 `backfillSubagentType()` の挙動 (空文字や型不一致は skip) と整合させる。
 */
export class MetaJsonIngester implements Analyzer {
  readonly id = 'MetaJsonIngester';
  readonly tier = 1 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['meta_json'];

  constructor(private readonly opts: MetaJsonIngesterOptions = {}) {}

  // Ingester は Wave 実行フェーズ (onRunEnd) で emit する (消費側は orchestrator Pass 1 で初期化済み)。
  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const baseDir =
      this.opts.claudeProjectsDir ?? path.join(os.homedir(), '.claude', 'projects');

    let projectNames: string[];
    try {
      projectNames = fs.readdirSync(baseDir);
    } catch {
      ctx.logger.info('[MetaJsonIngester] no projects dir');
      return;
    }

    let emitted = 0;
    for (const projectName of projectNames) {
      const projectPath = path.join(baseDir, projectName);
      emitted += await this.emitMetaJsonForProject(projectPath, ctx);
    }

    ctx.logger.info(`[MetaJsonIngester] emitted ${emitted} meta.json entries`);
  }

  private async emitMetaJsonForProject(projectPath: string, ctx: AnalyzerContext): Promise<number> {
    let sessionEntries: string[];
    try {
      if (!fs.statSync(projectPath).isDirectory()) return 0;
      sessionEntries = fs.readdirSync(projectPath);
    } catch {
      return 0;
    }

    let emitted = 0;
    for (const sessionEntry of sessionEntries) {
      emitted += await this.emitMetaJsonForSession(
        path.join(projectPath, sessionEntry, 'subagents'),
        sessionEntry,
        ctx,
      );
    }
    return emitted;
  }

  /**
   * 1 セッションの `subagents/` 配下の meta.json を emit する。
   * ディレクトリ不在（readdir 失敗）は 0 件として skip する。
   */
  private async emitMetaJsonForSession(
    subagentDir: string,
    sessionEntry: string,
    ctx: AnalyzerContext,
  ): Promise<number> {
    let metaFiles: string[];
    try {
      metaFiles = fs.readdirSync(subagentDir).filter((f) => f.endsWith('.meta.json'));
    } catch {
      return 0;
    }

    let emitted = 0;
    for (const metaFile of metaFiles) {
      const match = AGENT_META_RE.exec(metaFile);
      if (!match) continue;
      const agentId = match[1];
      const fullPath = path.join(subagentDir, metaFile);

      const agentType = readAgentType(fullPath, ctx);
      if (!agentType) continue;

      await ctx.bus.publish({
        kind: 'meta_json',
        sessionId: sessionEntry,
        agentId,
        agentType,
        filePath: fullPath,
      });
      emitted++;
    }
    return emitted;
  }
}

/**
 * meta.json から `agentType` を読む。読み取り・パース失敗は error ログを残して null を返す。
 * `agentType` が文字列でない場合や空文字の場合も null を返す
 * （既存 `backfillSubagentType()` の skip 挙動と整合させる）。
 */
function readAgentType(fullPath: string, ctx: AnalyzerContext): string | null {
  try {
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(raw) as { agentType?: unknown };
    if (typeof parsed.agentType === 'string' && parsed.agentType.length > 0) {
      return parsed.agentType;
    }
    return null;
  } catch (err) {
    ctx.logger.error(
      `[MetaJsonIngester] failed to read ${fullPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
