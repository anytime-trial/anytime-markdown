// JSONL spool の汎用機構（rename 先行 drain・孤児回収・滞留上限）。
//
// emergencySpool（Phase 5 S2）で確立したパターンを、Stop フック記録（flight-review /
// safe-point）へも使うために抽出した。書き手はフック（短命プロセス。TS の append または
// bash の `printf >>`）、読み手は拡張の定期 drain で、read → rm の間に追記された行を
// 失わないことが要件。イベント型ごとの検証・宛先は各ラッパー（emergencySpool /
// stopHookSpool）が持ち、本モジュールは行の入出力だけを扱う。
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

export type SpoolErrorReporter = (message: string) => void;

/**
 * 副作用: spool へ 1 行追記する。滞留が max 以上なら追記を拒否して `onError` へ通知する
 * （silent 破棄禁止。古い行を残すのは、発端イベントの方が原因調査に有用なため）。
 * 失敗はすべて fail-open。
 */
export function appendJsonlSpool<T>(
  path: string,
  value: T,
  max: number,
  onError: SpoolErrorReporter,
): void {
  try {
    mkdirSync(dirname(path), { recursive: true }); // 拡張未配置の環境でも spool だけは書ける
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
      if (lines.length >= max) {
        onError(`spool が上限 ${max} 件に達したため追記を破棄した: ${JSON.stringify(value).slice(0, 200)}`);
        return;
      }
    }
    appendFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    onError(`spool への追記に失敗した (${reason}): ${path}`);
  }
}

/**
 * 退避ファイル本文を 1 行ずつ検証して積む。
 * 壊れた行・型不一致の行は捨てるが `onError` へ渡して黙って消さない。
 */
function parseSpoolLines<T>(
  raw: string,
  isValid: (value: unknown) => value is T,
  onError: SpoolErrorReporter,
): T[] {
  const rows: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isValid(parsed)) {
        rows.push(parsed);
      } else {
        onError(`spool の行を破棄した (型不一致): ${trimmed.slice(0, 200)}`);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onError(`spool の行を破棄した (${reason}): ${trimmed.slice(0, 200)}`);
    }
  }
  return rows;
}

/**
 * 退避ファイル 1 本を読み出し、成功時のみ削除する。
 * 読取自体の失敗（EIO・権限等）ではファイルを**残置**して null を返す（次回 drain で再試行。
 * 読めていないイベントを削除すると記録が消失する）。
 */
function readDrainingFile<T>(
  file: string,
  isValid: (value: unknown) => value is T,
  onError: SpoolErrorReporter,
): T[] | null {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    onError(`退避 spool の読取に失敗した (${reason})。残置して次回再試行する: ${file}`);
    return null;
  }
  const rows = parseSpoolLines(raw, isValid, onError);
  try {
    rmSync(file, { force: true });
  } catch (err) {
    // 削除失敗は次回 drain で同内容が再回収され得る（at-least-once。取込側の冪等 INSERT が吸収）。
    const reason = err instanceof Error ? err.message : String(err);
    onError(`退避 spool の削除に失敗した (${reason}): ${file}`);
  }
  return rows;
}

/**
 * spool を読み出して削除する。**読む前に rename する**（read → rm の間の追記を失わない。
 * rename は同一ディレクトリ内で原子的）。
 * 過去の drain が読取失敗・クラッシュで残した `.draining-*` 残骸も先に回収する。
 * 壊れた行・型不一致の行は捨てるが `onError` へ渡して黙って消さない。
 */
export function drainJsonlSpool<T>(
  path: string,
  isValid: (value: unknown) => value is T,
  onError: SpoolErrorReporter = () => {},
): T[] {
  const rows: T[] = [];

  // 1) 孤児の退避ファイル（前回 drain の読取失敗・プロセス中断の残骸）を先に回収する。
  const prefix = `${basename(path)}.draining-`;
  let entries: string[] = [];
  try {
    entries = readdirSync(dirname(path));
  } catch {
    entries = []; // ディレクトリ不在 = spool 未作成の通常運転
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const recovered = readDrainingFile(join(dirname(path), entry), isValid, onError);
    if (recovered !== null) rows.push(...recovered);
  }

  // 2) 現行 spool を rename → 読取。
  if (!existsSync(path)) return rows;
  const draining = `${path}.draining-${randomUUID()}`;
  try {
    renameSync(path, draining);
  } catch (err) {
    // 他の drain が先に rename した等。取りこぼしではないので次回に回す。
    const reason = err instanceof Error ? err.message : String(err);
    onError(`spool の rename に失敗した (${reason}): ${path}`);
    return rows;
  }
  const current = readDrainingFile(draining, isValid, onError);
  if (current !== null) rows.push(...current);
  return rows;
}
