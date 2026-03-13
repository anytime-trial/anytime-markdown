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
  const activeFilePathRef = useRef<string | null>(null);
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
      activeFilePathRef.current = fp;
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
        const { content, previousContent } = await fetchContent(commits, 0, fp);
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
      const fp = activeFilePathRef.current ?? filePathRef.current;
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
    const startIndex = state.commits.length - 1;
    setState((prev) => ({
      ...prev,
      isPlaying: true,
      selectedIndex: startIndex,
    }));

    const fp = activeFilePathRef.current ?? filePathRef.current;
    if (!fp || !provider) return;

    let currentIndex = startIndex;

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
  }, [state.commits, state.playbackSpeed, provider, fetchContent, stopPlayback]);

  const setPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    setState((prev) => ({ ...prev, playbackSpeed: speed }));
  }, []);

  const close = useCallback(() => {
    stopPlayback();
    activeFilePathRef.current = null;
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
