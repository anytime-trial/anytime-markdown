/**
 * Auto Playback の再生列と送りの判定。
 *
 * 仕様: spec/31.trail/02.trail-viewer/auto-playback/auto-playback.ja.md
 *
 * DOM・タイマー・fetch を持たない純粋関数だけを置く。送りの制御（完了の合流と
 * 最小滞在時間の消化）は `components/CodeGraphPanel.tsx` にあり、ここは
 * 「次にどの目盛りを出すか」「もう終わりか」だけを決める。
 *
 * 本モジュールは `codeGraphPanel.ts` を import しない（あちらがこちらを import するため）。
 * 「現在」の目盛りを表す ID とラベルは呼び出し側から受け取る。
 */

/** 再生速度のプリセット。速いものほど最小滞在時間が短い。 */
export type CodeGraphPlaybackSpeed = '0.5x' | '1x' | '2x' | '4x';

export const PLAYBACK_SPEEDS: readonly CodeGraphPlaybackSpeed[] = ['0.5x', '1x', '2x', '4x'];

export const DEFAULT_PLAYBACK_SPEED: CodeGraphPlaybackSpeed = '1x';

/**
 * 速度は**フレーム間隔ではなく最小滞在時間**である（仕様 §2.3）。
 *
 * `graph_json` は 1 本 1.9 MB あり、取得後に sigma のグラフを組み直す。固定間隔で送ると
 * 間隔が描画コストを下回った時点で要求が積み上がり、速度を上げるほど滞留する。
 * 1 フレームは「取得完了 → 描画完了 → 最小滞在時間の経過」で閉じる。
 */
export const PLAYBACK_MIN_DWELL_MS: Readonly<Record<CodeGraphPlaybackSpeed, number>> = {
  '0.5x': 2000,
  '1x': 1000,
  '2x': 500,
  '4x': 250,
};

/** 連続してこの本数の取得に失敗したら再生を止める（サーバ障害を再生ループで叩き続けない）。 */
export const PLAYBACK_MAX_CONSECUTIVE_FAILURES = 3;

/** 再生列の目盛り 1 件。`id` は取得と生成要求に使う識別子（タグ / SHA / 「現在」の番兵）。 */
export interface CodeGraphPlaybackTick {
  readonly id: string;
  readonly label: string;
}

export interface CodeGraphPlaybackList {
  readonly ticks: readonly CodeGraphPlaybackTick[];
  /** 在庫が無いために再生列から外した目盛りの数。進捗表示に出す（仕様 §4.2）。 */
  readonly skipped: number;
}

/** `buildPlaybackList` の入力。目盛りの型は `codeGraphPanel.ts` の構造だけを要求する。 */
export interface CodeGraphPlaybackListInput {
  readonly granularity: 'release' | 'commit';
  readonly releases: readonly { readonly tag: string; readonly hasGraph: boolean }[];
  readonly commits: readonly {
    readonly sha: string;
    readonly shortSha: string;
    readonly hasGraph: boolean;
  }[];
  /** 「現在」を表す番兵 ID（`CURRENT_RELEASE`）。 */
  readonly currentId: string;
  /** 「現在」の表示ラベル（i18n 済み）。 */
  readonly currentLabel: string;
}

/**
 * 再生列を作る。**在庫のある目盛りだけを対象とし、未生成は飛ばす**（仕様 §4.2）。
 *
 * 未生成を含めると、再生が未生成の時点で止まって生成を促すか、さもなくば解析を誘発する。
 * どちらも「スライダー操作で解析を誘発しない」という Time Scrubber の決定に反する。
 * 飛ばした本数は `skipped` として返し、呼び出し側が常時表示する。
 */
export function buildPlaybackList(input: CodeGraphPlaybackListInput): CodeGraphPlaybackList {
  if (input.granularity === 'commit') {
    const available = input.commits.filter((c) => c.hasGraph);
    return {
      ticks: available.map((c) => ({ id: c.sha, label: c.shortSha })),
      skipped: input.commits.length - available.length,
    };
  }
  const available = input.releases.filter((r) => r.hasGraph);
  return {
    // 「現在」は常に在庫がある（現行のコードグラフそのもの）ので末尾に置く。
    ticks: [
      ...available.map((r) => ({ id: r.tag, label: r.tag })),
      { id: input.currentId, label: input.currentLabel },
    ],
    skipped: input.releases.length - available.length,
  };
}

/** 送る先が無ければ再生できない。 */
export function canPlay(list: CodeGraphPlaybackList): boolean {
  return list.ticks.length >= 2;
}

/**
 * 再生開始時に**最初に出す**目盛りの位置。
 *
 * 既に見えているフレームで最小滞在時間を空費しないよう、現在位置の次から始める。
 * 末尾にいるとき、および現在位置が再生列に無いとき（未生成の目盛りを選んでいるとき）は
 * 先頭へ戻す。
 */
export function playbackStartIndex(list: CodeGraphPlaybackList, currentId: string | null): number {
  if (currentId === null) return 0;
  const index = list.ticks.findIndex((t) => t.id === currentId);
  if (index < 0) return 0;
  if (index >= list.ticks.length - 1) return 0;
  return index + 1;
}

/** 次の目盛り。末尾では位置を保ったまま `done` を返す（ループしない）。 */
export function nextPlaybackIndex(
  list: CodeGraphPlaybackList,
  index: number,
): { readonly index: number; readonly done: boolean } {
  if (index >= list.ticks.length - 1) return { index, done: true };
  return { index: index + 1, done: false };
}

export function shouldStopOnFailures(consecutiveFailures: number): boolean {
  return consecutiveFailures >= PLAYBACK_MAX_CONSECUTIVE_FAILURES;
}
