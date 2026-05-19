import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';

const AGENT_META_RE = /^agent-(.+)\.meta\.json$/;

export interface MetaJsonIngesterOptions {
  /** ~/.claude/projects のオーバーライド (テスト用) */
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

  async onRunStart(ctx: AnalyzerContext): Promise<void> {
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
      let sessionEntries: string[];
      try {
        if (!fs.statSync(projectPath).isDirectory()) continue;
        sessionEntries = fs.readdirSync(projectPath);
      } catch {
        continue;
      }

      for (const sessionEntry of sessionEntries) {
        const subagentDir = path.join(projectPath, sessionEntry, 'subagents');
        let metaFiles: string[];
        try {
          metaFiles = fs.readdirSync(subagentDir).filter((f) => f.endsWith('.meta.json'));
        } catch {
          continue;
        }

        for (const metaFile of metaFiles) {
          const match = AGENT_META_RE.exec(metaFile);
          if (!match) continue;
          const agentId = match[1];
          const fullPath = path.join(subagentDir, metaFile);

          let agentType: string | null = null;
          try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const parsed = JSON.parse(raw) as { agentType?: unknown };
            if (typeof parsed.agentType === 'string' && parsed.agentType.length > 0) {
              agentType = parsed.agentType;
            }
          } catch (err) {
            ctx.logger.error(
              `[MetaJsonIngester] failed to read ${fullPath}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            continue;
          }
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
      }
    }

    ctx.logger.info(`[MetaJsonIngester] emitted ${emitted} meta.json entries`);
  }
}
