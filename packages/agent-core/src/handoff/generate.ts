// handoff/generate.ts — セッションの transcript を解決し、圧縮ステートを組成して保存し、
// レンダリング結果を返す。worker（node:sqlite を持つ）から呼ぶ生成ロジック。UI からは
// HTTP 経由でこれを呼ぶだけにし、生成ロジックを UI に置かない（RFC の分離方針）。

import { accessSync, constants, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentStatusStore } from '../status/AgentStatusStore';
import { parse } from './parseTranscript';
import { buildHandoffState } from './buildHandoff';
import { renderHandoffMarkdown, renderHandoffInjection } from './render';
import type { HandoffState } from './types';

export interface GeneratedHandoff {
  readonly payload: HandoffState;
  /** handoff/<id>.md 用の人間可読ドキュメント */
  readonly markdown: string;
  /** 新セッションへ注入する untrusted-fence 付きテキスト */
  readonly injection: string;
}

export interface GenerateHandoffOptions {
  /** Claude Code の projects ディレクトリ。既定は ~/.claude/projects */
  readonly projectsDir?: string;
}

/** projects 配下の各ディレクトリから `<sessionId>.jsonl` を探す。見つからなければ null。 */
export function findTranscriptPath(sessionId: string, projectsDir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(projectsDir);
  } catch (err) {
    console.error(`[handoff] failed to read projects dir: ${projectsDir}`, err);
    return null;
  }
  for (const dir of entries) {
    const candidate = join(projectsDir, dir, `${sessionId}.jsonl`);
    try {
      accessSync(candidate, constants.R_OK);
      return candidate;
    } catch {
      // このプロジェクトには無い
    }
  }
  return null;
}

/**
 * 指定セッションの handoff を生成し、圧縮ステートを agent_sessions.summary に保存する
 * （handoff_at も確定）。transcript が見つからなければ null。
 */
export function generateHandoff(
  store: AgentStatusStore,
  sessionId: string,
  options: GenerateHandoffOptions = {},
): GeneratedHandoff | null {
  const projectsDir = options.projectsDir ?? join(homedir(), '.claude', 'projects');
  const transcriptPath = findTranscriptPath(sessionId, projectsDir);
  if (!transcriptPath) return null;

  const row = store.queryOne(sessionId);
  const events = parse(transcriptPath);
  const payload = buildHandoffState(events, {
    branch: row?.branch ?? '',
    lastCommit: row?.lastCommit?.hash ?? '',
  });

  store.upsertSummary({ sessionId, summary: JSON.stringify(payload) });

  return {
    payload,
    markdown: renderHandoffMarkdown(payload),
    injection: renderHandoffInjection(payload),
  };
}
