// handoff/buildHandoff.ts — 構造化イベント + git 情報から圧縮ステート payload を組成する。
// recall make_context.py の決定論部のみ移植（TextRank 抜き）。3 用途共用の単一形を返す。
//
// 圧縮性のため files/commands に上限を設ける（payload を ~1-2K トークンに保つ）。上限なしだと
// 長尺セッションで 1 万〜2 万トークンに膨張し seed として使えない（PoC で確認）。

import {
  commands as extractCommands,
  firstUserGoal,
  lastAssistantState,
  touchedFiles,
} from './parseTranscript';
import { redact } from './redact';
import { HANDOFF_VERSION, type HandoffState, type TranscriptEvent } from './types';

export interface BuildHandoffOptions {
  readonly branch?: string;
  readonly lastCommit?: string;
  readonly maxFiles?: number;
  readonly maxCommands?: number;
}

const DEFAULT_MAX_FILES = 30;
const DEFAULT_MAX_COMMANDS = 15;

/** 直近 max 件（最新ほど現在状態に近い）に絞り、全件数を併せて返す。 */
function capRecent(items: readonly string[], max: number): { items: string[]; total: number } {
  if (items.length <= max) return { items: [...items], total: items.length };
  return { items: items.slice(items.length - max), total: items.length };
}

/**
 * 構造化イベントから handoff payload（圧縮ステート）を組成する。
 * 文字列フィールドは redact を通す。summary 列へ JSON 保存できる純粋なオブジェクトを返す。
 */
export function buildHandoffState(
  events: readonly TranscriptEvent[],
  options: BuildHandoffOptions = {},
): HandoffState {
  const {
    branch = '',
    lastCommit = '',
    maxFiles = DEFAULT_MAX_FILES,
    maxCommands = DEFAULT_MAX_COMMANDS,
  } = options;

  const files = capRecent(touchedFiles(events).map(redact), maxFiles);
  const cmds = capRecent(extractCommands(events).map(redact), maxCommands);

  return {
    handoffVersion: HANDOFF_VERSION,
    structured: {
      goal: redact(firstUserGoal(events)),
      filesTouched: files.items,
      filesTouchedTotal: files.total,
      commands: cmds.items,
      commandsTotal: cmds.total,
      lastState: redact(lastAssistantState(events)),
      branch,
      lastCommit,
    },
    narrative: null,
  };
}
