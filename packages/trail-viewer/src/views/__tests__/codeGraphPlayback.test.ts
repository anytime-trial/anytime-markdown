/**
 * Auto Playback の再生列と送りの判定（純粋関数）。
 *
 * 仕様: spec/31.trail/02.trail-viewer/auto-playback/auto-playback.ja.md
 */
import {
  buildPlaybackList,
  canPlay,
  nextPlaybackIndex,
  playbackStartIndex,
  shouldStopOnFailures,
  PLAYBACK_MIN_DWELL_MS,
  PLAYBACK_MAX_CONSECUTIVE_FAILURES,
  PLAYBACK_SPEEDS,
} from '../codeGraphPlayback';

const CURRENT = 'current';

function release(tag: string, hasGraph: boolean) {
  return { tag, releasedAt: `2026-08-0${tag.length}T00:00:00.000Z`, hasGraph };
}

function commit(sha: string, hasGraph: boolean) {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    committedAt: '2026-08-04T00:00:00.000Z',
    subject: `subject ${sha}`,
    hasGraph,
  };
}

describe('buildPlaybackList', () => {
  it('リリース粒度では在庫のある目盛りだけを並べ、末尾に「現在」を置く', () => {
    const list = buildPlaybackList({
      granularity: 'release',
      releases: [release('v1', true), release('v22', false), release('v333', true)],
      commits: [],
      currentId: CURRENT,
      currentLabel: '現在',
    });

    expect(list.ticks.map((t) => t.id)).toEqual(['v1', 'v333', CURRENT]);
    expect(list.ticks.map((t) => t.label)).toEqual(['v1', 'v333', '現在']);
  });

  it('リリース粒度の除外件数は在庫の無い目盛りの数である', () => {
    const list = buildPlaybackList({
      granularity: 'release',
      releases: [release('v1', true), release('v22', false), release('v333', false)],
      commits: [],
      currentId: CURRENT,
      currentLabel: '現在',
    });

    expect(list.skipped).toBe(2);
  });

  it('コミット粒度では在庫のあるコミットだけを短縮 SHA のラベルで並べ、「現在」を置かない', () => {
    const list = buildPlaybackList({
      granularity: 'commit',
      releases: [release('v1', true)],
      commits: [commit('aaaaaaaabbbb', true), commit('ccccccccdddd', false), commit('eeeeeeeeffff', true)],
      currentId: CURRENT,
      currentLabel: '現在',
    });

    expect(list.ticks.map((t) => t.id)).toEqual(['aaaaaaaabbbb', 'eeeeeeeeffff']);
    expect(list.ticks.map((t) => t.label)).toEqual(['aaaaaaa', 'eeeeeee']);
    expect(list.skipped).toBe(1);
  });

  it('在庫が 1 件も無いリリース粒度でも「現在」だけは残る', () => {
    const list = buildPlaybackList({
      granularity: 'release',
      releases: [release('v1', false)],
      commits: [],
      currentId: CURRENT,
      currentLabel: '現在',
    });

    expect(list.ticks.map((t) => t.id)).toEqual([CURRENT]);
    expect(list.skipped).toBe(1);
  });
});

describe('canPlay', () => {
  it('再生対象が 2 本未満なら再生できない', () => {
    expect(canPlay({ ticks: [], skipped: 0 })).toBe(false);
    expect(canPlay({ ticks: [{ id: 'a', label: 'a' }], skipped: 0 })).toBe(false);
  });

  it('再生対象が 2 本以上なら再生できる', () => {
    expect(
      canPlay({ ticks: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], skipped: 0 }),
    ).toBe(true);
  });
});

describe('playbackStartIndex', () => {
  const list = {
    ticks: [
      { id: 'a', label: 'a' },
      { id: 'b', label: 'b' },
      { id: 'c', label: 'c' },
    ],
    skipped: 0,
  };

  it('現在位置の次の目盛りから始める（既に見えているフレームで待たない）', () => {
    expect(playbackStartIndex(list, 'a')).toBe(1);
    expect(playbackStartIndex(list, 'b')).toBe(2);
  });

  it('末尾にいるときは先頭へ戻す', () => {
    expect(playbackStartIndex(list, 'c')).toBe(0);
  });

  it('現在位置が再生列に無い（未生成の目盛りを選んでいる）ときは先頭から始める', () => {
    expect(playbackStartIndex(list, 'unknown')).toBe(0);
    expect(playbackStartIndex(list, null)).toBe(0);
  });
});

describe('nextPlaybackIndex', () => {
  const list = {
    ticks: [
      { id: 'a', label: 'a' },
      { id: 'b', label: 'b' },
    ],
    skipped: 0,
  };

  it('次の目盛りへ進む', () => {
    expect(nextPlaybackIndex(list, 0)).toEqual({ index: 1, done: false });
  });

  it('末尾では停止する（ループしない）', () => {
    expect(nextPlaybackIndex(list, 1)).toEqual({ index: 1, done: true });
  });
});

describe('shouldStopOnFailures', () => {
  it('連続 3 本の失敗で停止する', () => {
    expect(shouldStopOnFailures(2)).toBe(false);
    expect(shouldStopOnFailures(PLAYBACK_MAX_CONSECUTIVE_FAILURES)).toBe(true);
  });
});

describe('速度プリセット', () => {
  it('4 段階すべてに最小滞在時間があり、速いほど短い', () => {
    expect(PLAYBACK_SPEEDS).toEqual(['0.5x', '1x', '2x', '4x']);
    const dwells = PLAYBACK_SPEEDS.map((s) => PLAYBACK_MIN_DWELL_MS[s]);
    expect(dwells).toEqual([...dwells].sort((a, b) => b - a));
    expect(dwells.every((d) => d > 0)).toBe(true);
  });
});
