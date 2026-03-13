import { renderHook, act } from "@testing-library/react";
import { useTimeline } from "../hooks/useTimeline";
import type { TimelineDataProvider, TimelineCommit } from "../types/timeline";

const COMMITS: TimelineCommit[] = [
  { sha: "aaa", message: "latest commit", author: "Alice", date: new Date("2026-03-13") },
  { sha: "bbb", message: "second commit", author: "Bob", date: new Date("2026-03-12") },
  { sha: "ccc", message: "initial commit", author: "Alice", date: new Date("2026-03-11") },
];

function createMockProvider(overrides?: Partial<TimelineDataProvider>): TimelineDataProvider {
  return {
    getCommits: jest.fn().mockResolvedValue(COMMITS),
    getFileContent: jest.fn().mockImplementation((_path: string, sha: string) =>
      Promise.resolve(`content-${sha}`),
    ),
    ...overrides,
  };
}

describe("useTimeline", () => {
  test("初期状態: commits 空、isLoading false", () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useTimeline(provider, null));
    expect(result.current.state.commits).toEqual([]);
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.isPlaying).toBe(false);
  });

  test("loadTimeline: コミット一覧を取得し最新を選択", async () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useTimeline(provider, null));

    await act(async () => {
      await result.current.loadTimeline("test.md");
    });

    expect(provider.getCommits).toHaveBeenCalledWith("test.md");
    expect(result.current.state.commits).toEqual(COMMITS);
    expect(result.current.state.selectedIndex).toBe(0);
    expect(result.current.state.content).toBe("content-aaa");
  });

  test("selectCommit: 指定インデックスのコミットを選択", async () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useTimeline(provider, null));

    await act(async () => {
      await result.current.loadTimeline("test.md");
    });
    await act(async () => {
      await result.current.selectCommit(2);
    });

    expect(result.current.state.selectedIndex).toBe(2);
    expect(result.current.state.content).toBe("content-ccc");
    expect(result.current.state.previousContent).toBeNull();
  });

  test("selectCommit: 中間コミット選択時に previousContent を取得", async () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useTimeline(provider, null));

    await act(async () => {
      await result.current.loadTimeline("test.md");
    });
    await act(async () => {
      await result.current.selectCommit(1);
    });

    expect(result.current.state.content).toBe("content-bbb");
    expect(result.current.state.previousContent).toBe("content-ccc");
  });

  test("provider が null の場合は何もしない", async () => {
    const { result } = renderHook(() => useTimeline(null, null));

    await act(async () => {
      await result.current.loadTimeline("test.md");
    });

    expect(result.current.state.commits).toEqual([]);
  });

  test("close: タイムラインを閉じて初期状態に戻す", async () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useTimeline(provider, null));

    await act(async () => {
      await result.current.loadTimeline("test.md");
    });
    act(() => {
      result.current.close();
    });

    expect(result.current.state.commits).toEqual([]);
    expect(result.current.state.content).toBeNull();
    expect(result.current.state.isPlaying).toBe(false);
  });

  test("setPlaybackSpeed: 再生速度を変更", async () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useTimeline(provider, null));

    act(() => {
      result.current.setPlaybackSpeed(5);
    });

    expect(result.current.state.playbackSpeed).toBe(5);
  });

  test("loadTimeline: エラー時に error を設定", async () => {
    const provider = createMockProvider({
      getCommits: jest.fn().mockRejectedValue(new Error("network error")),
    });
    const { result } = renderHook(() => useTimeline(provider, null));

    await act(async () => {
      await result.current.loadTimeline("test.md");
    });

    expect(result.current.state.error).toBe("network error");
    expect(result.current.state.isLoading).toBe(false);
  });
});
