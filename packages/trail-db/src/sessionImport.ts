/**
 * セッション JSONL の取り込みのうち、DB に触れない部分。
 *
 * `TrailDatabase.importSession` から切り出した純粋関数群（振る舞いは移設前と同一）。
 * 取りこぼしは「メッセージが数件少ない」「セッションの model が空」という静かな形でしか
 * 現れないため、単体で固定できるようにここへ分けている。
 */
import { toUTC } from './dateUtils';
import type { RawLine } from './rawLine';

/** メッセージとして取り込まない行の type。セッションの本文ではなく Claude Code 内部の記録。 */
const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'last-prompt',
  'queue-operation',
]);

export interface SessionImportMeta {
  sessionId: string;
  slug: string;
  version: string;
  model: string;
  entrypoint: string;
  /** 最初に現れた解釈可能なタイムスタンプ（UTC 正規化済み）。1 件も無ければ空文字。 */
  startTime: string;
  /** 最後に現れたタイムスタンプ（UTC 正規化済み）。 */
  endTime: string;
  messageCount: number;
  messagesToInsert: RawLine[];
}

/** JSONL の本文を 1 行ずつパースする。壊れた行は捨て、残りの取り込みは続ける。 */
export function parseJsonlLines(content: string): RawLine[] {
  const parsed: RawLine[] = [];
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    try {
      parsed.push(JSON.parse(line) as RawLine);
    } catch {
      // Skip malformed lines
    }
  }
  return parsed;
}

/** 先に現れた非空の値を優先する（セッションのメタ情報は最初の 1 件を採る）。 */
function keepFirst(current: string, candidate: string | undefined): string {
  return current || candidate || '';
}

/**
 * 取り込む行を選びつつ、セッション単位のメタ情報を集める。
 *
 * メタ情報は「最初に現れた非空の値」を採る。ただし `endTime` だけは最後の値で上書きする。
 */
export function extractSessionMetaFromLines(parsed: readonly RawLine[]): SessionImportMeta {
  const meta: SessionImportMeta = {
    sessionId: '',
    slug: '',
    version: '',
    model: '',
    entrypoint: '',
    startTime: '',
    endTime: '',
    messageCount: 0,
    messagesToInsert: [],
  };

  for (const raw of parsed) {
    if (!raw.type || SKIP_TYPES.has(raw.type)) continue;
    if (raw.isMeta === true) continue;

    const utc = raw.timestamp ? toUTC(raw.timestamp) : '';
    meta.sessionId = keepFirst(meta.sessionId, raw.sessionId);
    meta.slug = keepFirst(meta.slug, raw.slug);
    meta.version = keepFirst(meta.version, raw.version);
    meta.entrypoint = keepFirst(meta.entrypoint, raw.entrypoint);
    meta.model = keepFirst(meta.model, raw.message?.model);
    meta.startTime = keepFirst(meta.startTime, utc);
    if (raw.timestamp) meta.endTime = utc;

    meta.messagesToInsert.push(raw);
    meta.messageCount++;
  }

  return meta;
}
