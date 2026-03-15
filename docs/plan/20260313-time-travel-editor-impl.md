# タイムトラベルエディタ（Document Timeline）実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Git コミット履歴をタイムラインスライダーで可視化し、任意時点のプレビューと差分アニメーション再生を提供する。

**Architecture:** `TimelineDataProvider` インターフェースでデータソースを抽象化し、VS Code（ローカル Git）と Web アプリ（GitHub API）で実装を差し替える。\
UI コンポーネント（`TimelineBar`, `TimelinePreview`, `TimelineDiffView`）と状態管理 hook（`useTimeline`）は `editor-core` に共通実装する。

**Tech Stack:** React 19, MUI 7, TipTap, GitHub REST API, VS Code Git Extension API, 既存 `diffEngine`

**設計書:** `docs/plan/20260313-time-travel-editor.md`

---


## Phase 1: 型定義とデータプロバイダーインターフェース


### Task 1: Timeline 型定義の作成

**Files:**

- Create: `packages/editor-core/src/types/timeline.ts`
- Modify: `packages/editor-core/src/index.ts`（export 追加）

**Step 1: 型定義ファイルを作成**

```typescript
// packages/editor-core/src/types/timeline.ts

/** タイムライン上の1コミットを表す */
export interface TimelineCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

/** プラットフォーム別のデータソース抽象 */
export interface TimelineDataProvider {
  /** コミット一覧を取得（新しい順） */
  getCommits(filePath: string): Promise<TimelineCommit[]>;
  /** 指定コミットのファイル内容を取得 */
  getFileContent(filePath: string, sha: string): Promise<string>;
}

/** タイムライン再生速度（秒） */
export type PlaybackSpeed = 1 | 2 | 5;

/** タイムラインの状態 */
export interface TimelineState {
  /** コミット一覧 */
  commits: TimelineCommit[];
  /** 現在選択中のコミットインデックス */
  selectedIndex: number;
  /** 選択中コミットのファイル内容 */
  content: string | null;
  /** 前コミットとの差分テキスト（差分ハイライト用） */
  previousContent: string | null;
  /** 再生中かどうか */
  isPlaying: boolean;
  /** 再生速度 */
  playbackSpeed: PlaybackSpeed;
  /** 読み込み中 */
  isLoading: boolean;
  /** エラーメッセージ */
  error: string | null;
}
```

**Step 2: `index.ts` に export を追加**

`packages/editor-core/src/index.ts` の既存 export に追加:

```typescript
export type {
  TimelineCommit,
  TimelineDataProvider,
  PlaybackSpeed,
  TimelineState,
} from "./types/timeline";
```

**Step 3: コミット**

```bash
git add packages/editor-core/src/types/timeline.ts packages/editor-core/src/index.ts
git commit -m "feat: add Timeline type definitions"
```

---


## Phase 2: useTimeline フック（状態管理）


### Task 2: useTimeline フックのテスト作成

**Files:**

- Create: `packages/editor-core/src/__tests__/useTimeline.test.ts`

**Step 1: テストファイルを作成**

```typescript
// packages/editor-core/src/__tests__/useTimeline.test.ts
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
```

**Step 2: テスト失敗を確認**

Run: `cd /anytime-markdown && npx jest packages/editor-core/src/__tests__/useTimeline.test.ts --no-coverage`\
Expected: FAIL（`useTimeline` が存在しない）

**Step 3: コミット**

```bash
git add packages/editor-core/src/__tests__/useTimeline.test.ts
git commit -m "test: add useTimeline hook tests"
```

---


### Task 3: useTimeline フックの実装

**Files:**

- Create: `packages/editor-core/src/hooks/useTimeline.ts`
- Modify: `packages/editor-core/src/index.ts`（export 追加）

**Step 1: useTimeline フックを実装**

```typescript
// packages/editor-core/src/hooks/useTimeline.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PlaybackSpeed,
  TimelineCommit,
  TimelineDataProvider,
  TimelineState,
} from "../types/timeline";

const INITIAL_STATE: TimelineState = {
  commits: [],
  selectedIndex: 0,
  content: null,
  previousContent: null,
  isPlaying: false,
  playbackSpeed: 2,
  isLoading: false,
  error: null,
};

export function useTimeline(
  provider: TimelineDataProvider | null,
  filePath: string | null,
) {
  const [state, setState] = useState<TimelineState>(INITIAL_STATE);
  const filePathRef = useRef(filePath);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  filePathRef.current = filePath;

  const stopPlayback = useCallback(() => {
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, []);

  const fetchContent = useCallback(
    async (
      commits: TimelineCommit[],
      index: number,
      fp: string,
    ): Promise<{ content: string | null; previousContent: string | null }> => {
      if (!provider || index < 0 || index >= commits.length) {
        return { content: null, previousContent: null };
      }
      const content = await provider.getFileContent(fp, commits[index].sha);
      const previousContent =
        index < commits.length - 1
          ? await provider.getFileContent(fp, commits[index + 1].sha)
          : null;
      return { content, previousContent };
    },
    [provider],
  );

  const loadTimeline = useCallback(
    async (fp: string) => {
      if (!provider) return;
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const commits = await provider.getCommits(fp);
        if (commits.length === 0) {
          setState({
            ...INITIAL_STATE,
            error: "No commits found",
          });
          return;
        }
        const { content, previousContent } = await fetchContent(
          commits,
          0,
          fp,
        );
        setState({
          commits,
          selectedIndex: 0,
          content,
          previousContent,
          isPlaying: false,
          playbackSpeed: 2,
          isLoading: false,
          error: null,
        });
      } catch (e) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: e instanceof Error ? e.message : "Unknown error",
        }));
      }
    },
    [provider, fetchContent],
  );

  const selectCommit = useCallback(
    async (index: number) => {
      const fp = filePathRef.current;
      if (!provider || !fp) return;
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const { content, previousContent } = await fetchContent(
          state.commits,
          index,
          fp,
        );
        setState((prev) => ({
          ...prev,
          selectedIndex: index,
          content,
          previousContent,
          isLoading: false,
        }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: e instanceof Error ? e.message : "Unknown error",
        }));
      }
    },
    [provider, state.commits, fetchContent],
  );

  const startPlayback = useCallback(() => {
    if (state.commits.length === 0) return;
    // 最古のコミットから再生開始
    const startIndex = state.commits.length - 1;
    setState((prev) => ({
      ...prev,
      isPlaying: true,
      selectedIndex: startIndex,
    }));

    const fp = filePathRef.current;
    if (!fp || !provider) return;

    let currentIndex = startIndex;

    // 最古コミットの内容を即座にロード
    fetchContent(state.commits, currentIndex, fp).then(
      ({ content, previousContent }) => {
        setState((prev) => ({
          ...prev,
          content,
          previousContent,
          selectedIndex: currentIndex,
        }));
      },
    );

    playTimerRef.current = setInterval(() => {
      currentIndex -= 1;
      if (currentIndex < 0) {
        stopPlayback();
        return;
      }
      fetchContent(state.commits, currentIndex, fp).then(
        ({ content, previousContent }) => {
          setState((prev) => ({
            ...prev,
            content,
            previousContent,
            selectedIndex: currentIndex,
          }));
        },
      );
    }, state.playbackSpeed * 1000);
  }, [
    state.commits,
    state.playbackSpeed,
    provider,
    fetchContent,
    stopPlayback,
  ]);

  const setPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    setState((prev) => ({ ...prev, playbackSpeed: speed }));
  }, []);

  const close = useCallback(() => {
    stopPlayback();
    setState(INITIAL_STATE);
  }, [stopPlayback]);

  return {
    state,
    loadTimeline,
    selectCommit,
    startPlayback,
    stopPlayback,
    setPlaybackSpeed,
    close,
  };
}
```

**Step 2: `index.ts` に export 追加**

```typescript
export { useTimeline } from "./hooks/useTimeline";
```

**Step 3: テスト実行**

Run: `cd /anytime-markdown && npx jest packages/editor-core/src/__tests__/useTimeline.test.ts --no-coverage`\
Expected: ALL PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/hooks/useTimeline.ts packages/editor-core/src/index.ts
git commit -m "feat: implement useTimeline hook for timeline state management"
```

---


## Phase 3: UI コンポーネント


### Task 4: TimelineBar コンポーネント

**Files:**

- Create: `packages/editor-core/src/components/TimelineBar.tsx`
- Modify: `packages/editor-core/src/index.ts`（export 追加）

> TimelineBar はエディタ下部に配置するスライダー + 再生コントロール。\
> MUI の `Slider`, `IconButton`, `Typography`, `Box` を使用する。

**Step 1: コンポーネントを作成**

```typescript
// packages/editor-core/src/components/TimelineBar.tsx
import CloseIcon from "@mui/icons-material/Close";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SpeedIcon from "@mui/icons-material/Speed";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Slider,
  Tooltip,
  Typography,
} from "@mui/material";
import { type FC, useCallback, useMemo, useState } from "react";

import type {
  PlaybackSpeed,
  TimelineCommit,
  TimelineState,
} from "../types/timeline";

interface TimelineBarProps {
  state: TimelineState;
  onSelectCommit: (index: number) => void;
  onStartPlayback: () => void;
  onStopPlayback: () => void;
  onSetPlaybackSpeed: (speed: PlaybackSpeed) => void;
  onClose: () => void;
  t: (key: string) => string;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

function truncateMessage(msg: string, max = 60): string {
  const firstLine = msg.split("\n")[0];
  return firstLine.length > max
    ? firstLine.slice(0, max) + "..."
    : firstLine;
}

const SPEED_OPTIONS: PlaybackSpeed[] = [1, 2, 5];

export const TimelineBar: FC<TimelineBarProps> = ({
  state,
  onSelectCommit,
  onStartPlayback,
  onStopPlayback,
  onSetPlaybackSpeed,
  onClose,
  t,
}) => {
  const { commits, selectedIndex, isPlaying, playbackSpeed, isLoading } = state;
  const [speedAnchor, setSpeedAnchor] = useState<HTMLElement | null>(null);

  const selectedCommit: TimelineCommit | null = commits[selectedIndex] ?? null;

  const sliderValue = useMemo(
    () => (commits.length > 0 ? commits.length - 1 - selectedIndex : 0),
    [commits.length, selectedIndex],
  );

  const handleSliderChange = useCallback(
    (_event: Event, value: number | number[]) => {
      const v = Array.isArray(value) ? value[0] : value;
      const commitIndex = commits.length - 1 - v;
      onSelectCommit(commitIndex);
    },
    [commits.length, onSelectCommit],
  );

  const marks = useMemo(
    () =>
      commits.map((c, i) => ({
        value: commits.length - 1 - i,
        label: "",
      })),
    [commits],
  );

  if (commits.length === 0) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 1,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        minHeight: 48,
      }}
    >
      {/* 再生/停止 */}
      <Tooltip title={isPlaying ? t("timelineStop") : t("timelinePlay")}>
        <IconButton
          size="small"
          onClick={isPlaying ? onStopPlayback : onStartPlayback}
          disabled={isLoading}
        >
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Tooltip>

      {/* スライダー */}
      <Slider
        value={sliderValue}
        min={0}
        max={commits.length - 1}
        step={1}
        marks={marks}
        onChange={handleSliderChange}
        disabled={isPlaying || isLoading}
        sx={{ flex: 1, mx: 1 }}
      />

      {/* コミット情報 */}
      {selectedCommit && (
        <Typography
          variant="caption"
          noWrap
          sx={{ minWidth: 200, maxWidth: 400, textAlign: "center" }}
        >
          {formatDate(selectedCommit.date)} —{" "}
          {truncateMessage(selectedCommit.message)}
        </Typography>
      )}

      {/* 再生速度 */}
      <Tooltip title={t("timelineSpeed")}>
        <IconButton
          size="small"
          onClick={(e) => setSpeedAnchor(e.currentTarget)}
        >
          <SpeedIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={speedAnchor}
        open={Boolean(speedAnchor)}
        onClose={() => setSpeedAnchor(null)}
      >
        {SPEED_OPTIONS.map((s) => (
          <MenuItem
            key={s}
            selected={s === playbackSpeed}
            onClick={() => {
              onSetPlaybackSpeed(s);
              setSpeedAnchor(null);
            }}
          >
            {s}s
          </MenuItem>
        ))}
      </Menu>

      {/* 閉じる */}
      <Tooltip title={t("timelineClose")}>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
```

**Step 2: `index.ts` に export 追加**

```typescript
export { TimelineBar } from "./components/TimelineBar";
```

**Step 3: ビルド確認**

Run: `cd /anytime-markdown && npx tsc --noEmit`\
Expected: エラーなし

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/TimelineBar.tsx packages/editor-core/src/index.ts
git commit -m "feat: add TimelineBar component with slider and playback controls"
```

---


### Task 5: TimelineDiffView コンポーネント

**Files:**

- Create: `packages/editor-core/src/components/TimelineDiffView.tsx`
- Modify: `packages/editor-core/src/index.ts`（export 追加）

> 既存の `computeDiff` を使い、前後コミットの差分を行単位でハイライト表示する読み取り専用ビュー。

**Step 1: コンポーネントを作成**

```typescript
// packages/editor-core/src/components/TimelineDiffView.tsx
import { Box, Typography, useTheme } from "@mui/material";
import { type FC, useMemo } from "react";

import { computeDiff } from "../utils/diffEngine";

interface TimelineDiffViewProps {
  content: string;
  previousContent: string | null;
  height: number;
}

export const TimelineDiffView: FC<TimelineDiffViewProps> = ({
  content,
  previousContent,
  height,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const diffLines = useMemo(() => {
    if (!previousContent) {
      return content.split("\n").map((text, i) => ({
        text,
        type: "equal" as const,
        lineNumber: i + 1,
      }));
    }
    const result = computeDiff(previousContent, content);
    return result.rightLines
      .filter((l) => l.type !== "padding")
      .map((l) => ({
        text: l.text,
        type: l.type,
        lineNumber: l.lineNumber,
      }));
  }, [content, previousContent]);

  const bgColor = (type: string): string | undefined => {
    if (type === "added" || type === "modified-new") {
      return isDark ? "rgba(46,160,67,0.15)" : "rgba(46,160,67,0.10)";
    }
    if (type === "removed" || type === "modified-old") {
      return isDark ? "rgba(248,81,73,0.15)" : "rgba(248,81,73,0.10)";
    }
    return undefined;
  };

  return (
    <Box
      sx={{
        height,
        overflow: "auto",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        lineHeight: 1.6,
        p: 2,
        bgcolor: "background.default",
      }}
    >
      {diffLines.map((line, i) => (
        <Box
          key={i}
          sx={{
            display: "flex",
            bgcolor: bgColor(line.type),
            px: 1,
            minHeight: "1.6em",
          }}
        >
          <Typography
            component="span"
            sx={{
              width: 48,
              textAlign: "right",
              pr: 2,
              color: "text.secondary",
              userSelect: "none",
              fontFamily: "monospace",
              fontSize: "inherit",
            }}
          >
            {line.lineNumber ?? ""}
          </Typography>
          <Typography
            component="span"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily: "monospace",
              fontSize: "inherit",
              flex: 1,
            }}
          >
            {line.text}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};
```

**Step 2: `index.ts` に export 追加**

```typescript
export { TimelineDiffView } from "./components/TimelineDiffView";
```

**Step 3: ビルド確認**

Run: `cd /anytime-markdown && npx tsc --noEmit`\
Expected: エラーなし

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/TimelineDiffView.tsx packages/editor-core/src/index.ts
git commit -m "feat: add TimelineDiffView component with diff highlighting"
```

---


### Task 6: i18n キー追加

**Files:**

- Modify: `packages/web-app/messages/ja/MarkdownEditor.json`
- Modify: `packages/web-app/messages/en/MarkdownEditor.json`

**Step 1: 日本語メッセージに追加**

以下のキーを JSON に追加:

```json
{
  "timeline": "タイムライン",
  "timelinePlay": "再生",
  "timelineStop": "停止",
  "timelineSpeed": "再生速度",
  "timelineClose": "タイムラインを閉じる",
  "timelineNoCommits": "コミット履歴がありません",
  "timelineError": "タイムラインの読み込みに失敗しました",
  "timelineLoading": "読み込み中..."
}
```

**Step 2: 英語メッセージに追加**

```json
{
  "timeline": "Timeline",
  "timelinePlay": "Play",
  "timelineStop": "Stop",
  "timelineSpeed": "Playback speed",
  "timelineClose": "Close timeline",
  "timelineNoCommits": "No commit history found",
  "timelineError": "Failed to load timeline",
  "timelineLoading": "Loading..."
}
```

**Step 3: コミット**

```bash
git add packages/web-app/messages/ja/MarkdownEditor.json packages/web-app/messages/en/MarkdownEditor.json
git commit -m "feat: add timeline i18n messages"
```

---


### Task 7: MarkdownEditorPage への Timeline 統合

**Files:**

- Modify: `packages/editor-core/src/MarkdownEditorPage.tsx`
- Modify: `packages/editor-core/src/components/EditorMainContent.tsx`

> `TimelineBar` をエディタ下部に配置し、タイムライン表示中は `TimelineDiffView` でプレビューを表示する。\
> `useEditorHeight` の `bottomOffset` で TimelineBar の高さ分（48px）を確保する。

**Step 1: MarkdownEditorPage に useTimeline を統合**

`MarkdownEditorPage.tsx` に以下を追加:

- `useTimeline` フックの呼び出し
- `timelineProvider` prop の追加（外部から注入）
- タイムライン開始ハンドラ（ツールバーボタンまたはコマンド経由）
- `EditorMainContent` にタイムライン状態を props で渡す

**Step 2: EditorMainContent にタイムライン表示を統合**

`EditorMainContent.tsx` に以下を追加:

- タイムラインアクティブ時: エディタ領域を `TimelineDiffView` に差し替え
- エディタ下部に `TimelineBar` を配置
- `useEditorHeight` の `bottomOffset` に TimelineBar の高さ（48px）を加算

**Step 3: ビルド確認**

Run: `cd /anytime-markdown && npx tsc --noEmit`\
Expected: エラーなし

**Step 4: コミット**

```bash
git add packages/editor-core/src/MarkdownEditorPage.tsx packages/editor-core/src/components/EditorMainContent.tsx
git commit -m "feat: integrate Timeline into editor page layout"
```

---


## Phase 4: VS Code プロバイダー


### Task 8: VscodeTimelineProvider の実装

**Files:**

- Create: `packages/vscode-extension/src/providers/VscodeTimelineProvider.ts`

> 既存の `GitHistoryProvider` のロジックを活用して `TimelineDataProvider` を実装する。\
> Webview との通信は `postMessage` 経由で行う。

**Step 1: プロバイダーを作成**

```typescript
// packages/vscode-extension/src/providers/VscodeTimelineProvider.ts
import type * as vscode from "vscode";

interface TimelineCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

interface Repository {
  log(options?: { maxEntries?: number; path?: string }): Promise<Array<{
    hash: string;
    message: string;
    authorName?: string;
    authorDate?: Date;
  }>>;
  show(ref: string, path: string): Promise<string>;
}

export class VscodeTimelineProvider {
  constructor(
    private getRepository: (uri: vscode.Uri) => Promise<Repository | null>,
  ) {}

  async getCommits(
    uri: vscode.Uri,
    relativePath: string,
  ): Promise<TimelineCommit[]> {
    const repo = await this.getRepository(uri);
    if (!repo) return [];
    const commits = await repo.log({ path: relativePath });
    return commits.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.authorName ?? "Unknown",
      date: c.authorDate ?? new Date(),
    }));
  }

  async getFileContent(
    uri: vscode.Uri,
    relativePath: string,
    sha: string,
  ): Promise<string | null> {
    const repo = await this.getRepository(uri);
    if (!repo) return null;
    try {
      return await repo.show(sha, relativePath);
    } catch {
      return null;
    }
  }
}
```

**Step 2: コミット**

```bash
git add packages/vscode-extension/src/providers/VscodeTimelineProvider.ts
git commit -m "feat: add VscodeTimelineProvider for local Git timeline data"
```

---


### Task 9: VS Code 拡張に Timeline メッセージングを追加

**Files:**

- Modify: `packages/vscode-extension/src/extension.ts`
- Modify: `packages/vscode-extension/src/providers/MarkdownEditorProvider.ts`

> Webview からの `loadTimeline` / `selectCommit` メッセージを `VscodeTimelineProvider` に中継する。

**Step 1: extension.ts に VscodeTimelineProvider を登録**

`VscodeTimelineProvider` をインスタンス化し、`GitHistoryProvider` の `getRepository` メソッドを共有する。

**Step 2: MarkdownEditorProvider にメッセージハンドラ追加**

```typescript
case 'loadTimeline': {
  const commits = await timelineProvider.getCommits(document.uri, relativePath);
  panel.webview.postMessage({ type: 'timelineCommits', commits });
  break;
}
case 'selectTimelineCommit': {
  const content = await timelineProvider.getFileContent(
    document.uri, relativePath, message.sha
  );
  panel.webview.postMessage({ type: 'timelineContent', sha: message.sha, content });
  break;
}
```

**Step 3: ビルド確認**

Run: `cd /anytime-markdown/packages/vscode-extension && npx webpack --mode production`\
Expected: エラーなし

**Step 4: コミット**

```bash
git add packages/vscode-extension/src/extension.ts packages/vscode-extension/src/providers/MarkdownEditorProvider.ts
git commit -m "feat: add timeline message handling in VS Code extension"
```

---


## Phase 5: Web アプリ GitHub 連携


### Task 10: GitHub OAuth フロー

**Files:**

- Create: `packages/web-app/src/app/api/auth/github/route.ts`
- Create: `packages/web-app/src/app/api/auth/github/callback/route.ts`
- Create: `packages/web-app/src/lib/githubAuth.ts`

> Next.js API Routes で GitHub OAuth を実装する。\
> `repo` スコープでアクセストークンを取得し、httpOnly cookie に保存する。

**Step 1: OAuth 認証開始エンドポイント**

```typescript
// packages/web-app/src/app/api/auth/github/route.ts
import { NextResponse } from "next/server";

export function GET(): NextResponse {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 500 });
  }
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "repo",
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/github/callback`,
  });
  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
}
```

**Step 2: OAuth コールバックエンドポイント**

```typescript
// packages/web-app/src/app/api/auth/github/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token, error } = await tokenRes.json();
  if (error || !access_token) {
    return NextResponse.json({ error: error ?? "Token exchange failed" }, { status: 400 });
  }
  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/markdown`,
  );
  response.cookies.set("github_token", access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8時間
    path: "/",
  });
  return response;
}
```

**Step 3: GitHub API ヘルパー**

```typescript
// packages/web-app/src/lib/githubAuth.ts
import { cookies } from "next/headers";

export async function getGitHubToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("github_token")?.value ?? null;
}
```

**Step 4: コミット**

```bash
git add packages/web-app/src/app/api/auth/github/ packages/web-app/src/lib/githubAuth.ts
git commit -m "feat: add GitHub OAuth flow for timeline feature"
```

---


### Task 11: GitHub Timeline API Routes

**Files:**

- Create: `packages/web-app/src/app/api/github/repos/route.ts`
- Create: `packages/web-app/src/app/api/github/commits/route.ts`
- Create: `packages/web-app/src/app/api/github/content/route.ts`

> GitHub API へのプロキシエンドポイント。\
> httpOnly cookie のトークンをサーバー側で読み取り、GitHub API を呼び出す。

**Step 1: リポジトリ一覧**

```typescript
// packages/web-app/src/app/api/github/repos/route.ts
import { NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/githubAuth";

export async function GET(): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const res = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=30",
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: res.status });
  }
  const repos = await res.json();
  return NextResponse.json(
    repos.map((r: Record<string, unknown>) => ({
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
    })),
  );
}
```

**Step 2: コミット一覧**

```typescript
// packages/web-app/src/app/api/github/commits/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/githubAuth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");
  if (!repo || !path) {
    return NextResponse.json({ error: "Missing repo or path" }, { status: 400 });
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: res.status });
  }
  const commits = await res.json();
  return NextResponse.json(
    commits.map((c: Record<string, unknown>) => ({
      sha: (c as { sha: string }).sha,
      message: ((c as { commit: { message: string } }).commit).message,
      author: ((c as { commit: { author: { name: string } } }).commit).author.name,
      date: ((c as { commit: { author: { date: string } } }).commit).author.date,
    })),
  );
}
```

**Step 3: ファイル内容取得**

```typescript
// packages/web-app/src/app/api/github/content/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/githubAuth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = request.nextUrl;
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");
  const ref = searchParams.get("ref");
  if (!repo || !path || !ref) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: res.status });
  }
  const data = await res.json();
  const content = Buffer.from((data as { content: string }).content, "base64").toString("utf-8");
  return NextResponse.json({ content });
}
```

**Step 4: コミット**

```bash
git add packages/web-app/src/app/api/github/
git commit -m "feat: add GitHub API proxy routes for timeline data"
```

---


### Task 12: GitHubTimelineProvider（Web 用）

**Files:**

- Create: `packages/web-app/src/lib/GitHubTimelineProvider.ts`

> `TimelineDataProvider` インターフェースを実装し、Next.js API Routes 経由で GitHub データを取得する。

**Step 1: プロバイダーを作成**

```typescript
// packages/web-app/src/lib/GitHubTimelineProvider.ts
import type { TimelineCommit, TimelineDataProvider } from "@anytime-markdown/editor-core";

export class GitHubTimelineProvider implements TimelineDataProvider {
  private repo: string;
  private cache = new Map<string, string>();

  constructor(repo: string) {
    this.repo = repo;
  }

  async getCommits(filePath: string): Promise<TimelineCommit[]> {
    const params = new URLSearchParams({ repo: this.repo, path: filePath });
    const res = await fetch(`/api/github/commits?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch commits");
    const data: Array<{ sha: string; message: string; author: string; date: string }> =
      await res.json();
    return data.map((c) => ({
      ...c,
      date: new Date(c.date),
    }));
  }

  async getFileContent(filePath: string, sha: string): Promise<string> {
    const cacheKey = `${sha}:${filePath}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      repo: this.repo,
      path: filePath,
      ref: sha,
    });
    const res = await fetch(`/api/github/content?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch file content");
    const { content } = (await res.json()) as { content: string };
    this.cache.set(cacheKey, content);
    return content;
  }
}
```

**Step 2: コミット**

```bash
git add packages/web-app/src/lib/GitHubTimelineProvider.ts
git commit -m "feat: add GitHubTimelineProvider for web app timeline"
```

---


### Task 13: リポジトリブラウザ UI

**Files:**

- Create: `packages/web-app/src/components/GitHubRepoBrowser.tsx`

> リポジトリ一覧 → ファイルツリー → Markdown ファイル選択のステップ UI。\
> MUI Dialog + List で実装する。

**Step 1: コンポーネントを作成**

リポジトリ選択 → ファイルツリー表示 → ファイル選択の 3 ステップダイアログ。

- `GET /api/github/repos` でリポジトリ一覧取得
- `GET /api/github/content?repo=xxx&path=&ref=main` でルートツリー取得
- `.md` / `.markdown` ファイルのみ選択可能

**Step 2: コミット**

```bash
git add packages/web-app/src/components/GitHubRepoBrowser.tsx
git commit -m "feat: add GitHub repository browser dialog"
```

---


## Phase 6: 統合テストとビルド検証


### Task 14: 統合テストと型チェック

**Files:**

- 全パッケージ

**Step 1: 型チェック**

Run: `cd /anytime-markdown && npx tsc --noEmit`\
Expected: エラーなし

**Step 2: ユニットテスト**

Run: `cd /anytime-markdown && npm test --workspaces --if-present`\
Expected: ALL PASS

**Step 3: VS Code 拡張ビルド**

Run: `cd /anytime-markdown/packages/vscode-extension && npx webpack --mode production`\
Expected: エラーなし

**Step 4: Web アプリビルド**

Run: `cd /anytime-markdown/packages/web-app && npm run build`\
Expected: エラーなし

**Step 5: 問題があれば修正してコミット**

---


## タスク一覧

| # | タスク | Phase | 推定 |
| --- | --- | --- | --- |
| 1 | Timeline 型定義 | 1 | 5分 |
| 2 | useTimeline テスト | 2 | 10分 |
| 3 | useTimeline 実装 | 2 | 15分 |
| 4 | TimelineBar コンポーネント | 3 | 15分 |
| 5 | TimelineDiffView コンポーネント | 3 | 10分 |
| 6 | i18n キー追加 | 3 | 5分 |
| 7 | MarkdownEditorPage 統合 | 3 | 20分 |
| 8 | VscodeTimelineProvider | 4 | 10分 |
| 9 | VS Code メッセージング | 4 | 15分 |
| 10 | GitHub OAuth | 5 | 15分 |
| 11 | GitHub API Routes | 5 | 15分 |
| 12 | GitHubTimelineProvider | 5 | 10分 |
| 13 | リポジトリブラウザ UI | 5 | 20分 |
| 14 | 統合テスト・ビルド検証 | 6 | 10分 |
