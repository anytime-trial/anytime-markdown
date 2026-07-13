import * as fs from 'node:fs';
import * as path from 'node:path';

import { AgentLogger } from '../utils/AgentLogger';

/** 管理ブロックの版。文面を変えたら上げる（既存ワークスペースのブロックが更新される）。 */
export const GUIDANCE_VERSION = 1;

const BLOCK_END = '<!-- /anytime-agent:dev-cycle-guidance -->';
/** 版違いも含めて既存の管理ブロックにマッチさせる（マーカー外は絶対に触らない）。 */
const BLOCK_PATTERN =
  /<!-- anytime-agent:dev-cycle-guidance v\d+ -->[\s\S]*?<!-- \/anytime-agent:dev-cycle-guidance -->/;

/** ワークスペース CLAUDE.md へ注入する管理ブロック（マーカー込み・末尾改行なし）。 */
export function buildGuidanceBlock(): string {
  return [
    `<!-- anytime-agent:dev-cycle-guidance v${GUIDANCE_VERSION} -->`,
    '## 開発基本スキル（anytime-agent 拡張が管理・手動編集しない）',
    '',
    '- 開発指示（実装・修正・リファクタ・一気通貫、Codex / ollama への委譲、サブエージェント回転）は `anytime-dev-cycle` スキル（`.claude/skills/anytime-dev-cycle/`）を基本として実行する。入口 3 モード・工程ルート・ゲートは同スキルを参照する。',
    '- 初回またはスキル更新後は、本編前にプリフライト（`node .claude/skills/anytime-dev-cycle/preflight.cjs`）を必ず実行する。',
    BLOCK_END,
  ].join('\n');
}

export type GuidanceAction = 'created' | 'appended' | 'updated' | 'unchanged';

/**
 * CLAUDE.md 本文へ管理ブロックを冪等に upsert する（純関数）。
 *
 * ユーザー本文には触れず、置換はマーカー内のみ。同一内容なら unchanged を返し、
 * 呼び出し側は書き込みを省略できる（git 追跡リポジトリを汚さない）。
 */
export function upsertGuidanceBlock(
  existing: string | null,
  block: string,
): { content: string; action: GuidanceAction } {
  if (existing === null || existing === undefined) {
    return { content: `${block}\n`, action: 'created' };
  }
  const match = BLOCK_PATTERN.exec(existing);
  if (match) {
    if (match[0] === block) {
      return { content: existing, action: 'unchanged' };
    }
    return { content: existing.replace(BLOCK_PATTERN, block), action: 'updated' };
  }
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${existing}${separator}${block}\n`, action: 'appended' };
}

/**
 * ワークスペースの `CLAUDE.md` へ管理ブロックを配置する（activate 時に呼ぶ）。
 *
 * 失敗しても activate を巻き込まないよう、エラーは warn ログに落として返る。
 */
export function installClaudeMdGuidance(opts: { readonly workspaceRoot: string }): void {
  const claudeMdPath = path.join(opts.workspaceRoot, 'CLAUDE.md');
  try {
    const existing = fs.existsSync(claudeMdPath)
      ? fs.readFileSync(claudeMdPath, 'utf8')
      : null;
    const { content, action } = upsertGuidanceBlock(existing, buildGuidanceBlock());
    if (action !== 'unchanged') {
      fs.writeFileSync(claudeMdPath, content);
    }
    AgentLogger.info(`[claude-md-guidance] ${claudeMdPath}: ${action}`);
  } catch (err) {
    AgentLogger.warn(`[claude-md-guidance] upsert failed: ${claudeMdPath} — ${String(err)}`);
  }
}
