/**
 * embedData.ts — useEmbedData フックのバニラ controller 版。
 *
 * OGP / oEmbed フェッチ・キャッシュ・既読ストア・RSS 更新チェックを
 * React hook なしで実装する。useEmbedData.ts の挙動を忠実に再現する。
 *
 * React に依存しない。副作用のクリーンアップは `destroy()` で行う。
 */

import type { EmbedProviders, OembedData, OgpData } from "../../types/embedProvider";
import { EmbedCache } from "../../utils/embedCache";
import type { EmbedBaseline } from "../../utils/embedInfoString";
import { isEmbedSeen } from "../../utils/embedSeenStore";
import { checkEmbedUpdate } from "../../utils/embedUpdateCheck";

// ===== モジュール共有キャッシュ（useEmbedData.ts と同じ設計） =====

const inflight = new Map<string, Promise<OgpData | OembedData>>();
const cache = new EmbedCache();

// ===== 型定義 =====

export interface FetchState<T> {
  loading: boolean;
  data: T | null;
  error: string | null;
}

type EmbedUpdateStatus = "loading" | "seen" | "unseen";

export interface UpdateCheckState {
  status: EmbedUpdateStatus;
  fingerprint: string | null;
  newTitle: string | null;
}

/**
 * OGP / oEmbed フェッチのコントローラ。
 * `fetch()` でリクエストを開始し `subscribe()` で状態変化を受け取る。
 * `cancel()` で進行中のリクエストをキャンセルする。
 */
interface EmbedFetchController<T extends OgpData | OembedData> {
  /** フェッチを開始し、完了時に subscriber を呼ぶ。 */
  fetch(url: string, keyPrefix: "ogp" | "oembed", fetcher: (url: string) => Promise<T>): void;
  /** 状態変化時に呼ばれるコールバックを登録する。 */
  subscribe(cb: (state: FetchState<T>) => void): void;
  /** 進行中のフェッチをキャンセルする。 */
  cancel(): void;
  /** 現在の状態を返す。 */
  getState(): FetchState<T>;
}

/**
 * EmbedFetchController を生成する（useEmbedFetch の vanilla 版）。
 */
export function createEmbedFetchController<T extends OgpData | OembedData>(): EmbedFetchController<T> {
  let state: FetchState<T> = { loading: true, data: null, error: null };
  let cancelled = false;
  const subscribers: Array<(s: FetchState<T>) => void> = [];

  function notify(): void {
    for (const cb of subscribers) cb(state);
  }

  return {
    subscribe(cb) {
      subscribers.push(cb);
    },
    getState() {
      return state;
    },
    cancel() {
      cancelled = true;
    },
    fetch(url, keyPrefix, fetcher) {
      cancelled = false;
      state = { loading: true, data: null, error: null };
      // loading 通知を同期的に発火する（指摘44）。旧実装はここで notify() せず完了時のみ
      // 通知していたため、embedViews.ts の `if (state.loading)` スケルトン描画分岐
      // （更新チェック等を含む）が呼び出し順序上、一度も到達しなかった。
      notify();

      const cached = cache.get(url);
      if (cached) {
        state = { loading: false, data: cached as T, error: null };
        notify();
        return;
      }
      const cachedError = cache.getError(url);
      if (cachedError) {
        state = { loading: false, data: null, error: cachedError };
        notify();
        return;
      }

      const key = `${keyPrefix}:${url}`;
      let p = inflight.get(key);
      if (!p) {
        const fetched = fetcher(url);
        p = fetched.finally(() => inflight.delete(key));
        p.catch(() => {
          // 未処理の rejection を抑制する; subscriber が個別に処理する
        });
        inflight.set(key, p);
      }
      p.then((data) => {
        if (cancelled) return;
        cache.set(url, data);
        state = { loading: false, data: data as T, error: null };
        notify();
      }).catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message || "fetch-failed";
        cache.setError(url, msg);
        state = { loading: false, data: null, error: msg };
        notify();
      });
    },
  };
}

// ===== RSS 更新チェックコントローラ =====

interface UpdateCheckController {
  /** OGP データが揃ったら更新チェックを開始する。 */
  check(
    url: string,
    ogpData: OgpData,
    providers: EmbedProviders,
    baseline: EmbedBaseline,
    onInitialBaseline: (baseline: EmbedBaseline) => void,
    logger?: (level: "warn", msg: string) => void,
  ): void;
  subscribe(cb: (state: UpdateCheckState) => void): void;
  cancel(): void;
  getState(): UpdateCheckState;
}

/**
 * RSS 更新チェックのコントローラ（useEmbedUpdateCheck の vanilla 版）。
 */
export function createUpdateCheckController(): UpdateCheckController {
  let state: UpdateCheckState = { status: "loading", fingerprint: null, newTitle: null };
  let cancelled = false;
  const subscribers: Array<(s: UpdateCheckState) => void> = [];

  function notify(): void {
    for (const cb of subscribers) cb(state);
  }

  return {
    subscribe(cb) {
      subscribers.push(cb);
    },
    getState() {
      return state;
    },
    cancel() {
      cancelled = true;
    },
    check(url, ogpData, providers, baseline, onInitialBaseline, logger) {
      cancelled = false;
      state = { status: "loading", fingerprint: null, newTitle: null };

      void (async () => {
        try {
          const result = await checkEmbedUpdate({
            url,
            ogpData,
            ogpHtml: ogpData.rawHtml ?? null,
            providers,
            baseline,
            logger,
          });
          if (cancelled) return;
          if (result.kind === "initial") {
            onInitialBaseline(result.baseline);
            state = { status: "seen", fingerprint: result.fingerprint, newTitle: null };
            notify();
            return;
          }
          if (result.kind === "updated") {
            const seen = isEmbedSeen(url, result.fingerprint);
            state = {
              status: seen ? "seen" : "unseen",
              fingerprint: result.fingerprint,
              newTitle: result.newTitle,
            };
            notify();
            return;
          }
          state = { status: "seen", fingerprint: null, newTitle: null };
          notify();
        } catch (e) {
          const ts = new Date().toISOString();
          logger?.("warn", `[${ts}] embed update check failed: ${url} - ${(e as Error).message}`);
          if (!cancelled) {
            state = { status: "seen", fingerprint: null, newTitle: null };
            notify();
          }
        }
      })();
    },
  };
}
