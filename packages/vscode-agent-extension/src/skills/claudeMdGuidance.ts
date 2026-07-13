import * as fs from 'node:fs';
import * as path from 'node:path';

import { AgentLogger } from '../utils/AgentLogger';

/** 管理ブロックの版。文面を変えたら上げる（既存ワークスペースのブロックが更新される）。 */
export const GUIDANCE_VERSION = 1;

const BLOCK_BEGIN_PATTERN = /<!-- anytime-agent:dev-cycle-guidance v\d+ -->/g;
const BLOCK_END = '<!-- /anytime-agent:dev-cycle-guidance -->';
/** 単一の整形済みブロック（開始/終了 1:1 を確認した後にのみ使う）。 */
const BLOCK_PATTERN =
  /<!-- anytime-agent:dev-cycle-guidance v\d+ -->[\s\S]*?<!-- \/anytime-agent:dev-cycle-guidance -->/;

/** ワークスペース CLAUDE.md へ注入する管理ブロック（マーカー込み・LF・末尾改行なし）。 */
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

export type GuidanceAction = 'created' | 'appended' | 'updated' | 'unchanged' | 'malformed';

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * CLAUDE.md 本文へ管理ブロックを冪等に upsert する（純関数）。
 *
 * ユーザー本文には触れない。開始/終了マーカーが 1:1 の整形済みブロックである場合のみ
 * マーカー内を置換し、孤立マーカー・重複ブロック等の不整合は `malformed` として
 * 無変更で返す（誤マッチでユーザー本文を巻き込む置換を構造的に排除する）。
 * 同一内容なら `unchanged` を返し、呼び出し側は書き込みを省略できる。
 * 既存本文が CRLF の場合はブロックの改行も CRLF へ揃える（改行混在を作らない）。
 */
export function upsertGuidanceBlock(
  existing: string | null,
  block: string,
): { content: string; action: GuidanceAction } {
  if (existing === null || existing === undefined) {
    return { content: `${block}\n`, action: 'created' };
  }
  const usesCrlf = existing.includes('\r\n');
  const nl = usesCrlf ? '\r\n' : '\n';
  const localizedBlock = usesCrlf ? block.replaceAll('\n', '\r\n') : block;

  const beginCount = countMatches(existing, BLOCK_BEGIN_PATTERN);
  const endCount = existing.split(BLOCK_END).length - 1;

  if (beginCount === 0 && endCount === 0) {
    if (existing.trim() === '') {
      return { content: `${localizedBlock}${nl}`, action: 'appended' };
    }
    const separator = existing.endsWith('\n') ? nl : `${nl}${nl}`;
    return { content: `${existing}${separator}${localizedBlock}${nl}`, action: 'appended' };
  }

  if (beginCount === 1 && endCount === 1) {
    const match = BLOCK_PATTERN.exec(existing);
    if (match) {
      if (match[0] === localizedBlock) {
        return { content: existing, action: 'unchanged' };
      }
      // 置換文字列の $ パターン解釈を避けるため関数置換にする
      return { content: existing.replace(BLOCK_PATTERN, () => localizedBlock), action: 'updated' };
    }
  }

  // 孤立マーカー・重複・終了が先行 — 手動編集やマージ衝突の産物。書き換えず呼び出し側で警告する。
  return { content: existing, action: 'malformed' };
}

/**
 * ワークスペースの `CLAUDE.md` へ管理ブロックを配置する（activate 時に呼ぶ）。
 *
 * 失敗しても activate を巻き込まないよう、エラーは stack 付き error ログに落として返る。
 */
export function installClaudeMdGuidance(opts: { readonly workspaceRoot: string }): void {
  const claudeMdPath = path.join(opts.workspaceRoot, 'CLAUDE.md');
  try {
    const existing = fs.existsSync(claudeMdPath)
      ? fs.readFileSync(claudeMdPath, 'utf8')
      : null;
    const { content, action } = upsertGuidanceBlock(existing, buildGuidanceBlock());
    if (action === 'malformed') {
      AgentLogger.warn(
        `[claude-md-guidance] ${claudeMdPath}: マーカーが不整合（孤立・重複）のため書き換えを中止。手動でブロックを修復してください`,
      );
      return;
    }
    if (action !== 'unchanged') {
      // SHORTCUT: writeFileSync 直書き. ceiling: 書込中クラッシュで部分書込の可能性(頻度極小・git 復元可). upgrade: 破損報告が出たら tmp+rename のアトミック書込へ.
      fs.writeFileSync(claudeMdPath, content);
    }
    AgentLogger.info(`[claude-md-guidance] ${claudeMdPath}: ${action}`);
  } catch (err) {
    AgentLogger.error(`[claude-md-guidance] upsert failed: ${claudeMdPath}`, err);
  }
}
