import { useEffect, useState } from "react";

import type { EmbedProviders, OembedData, OgpData } from "../types/embedProvider";
import { EmbedCache } from "../utils/embedCache";
import type { EmbedBaseline } from "../utils/embedInfoString";
import { isEmbedSeen } from "../utils/embedSeenStore";
import { checkEmbedUpdate } from "../utils/embedUpdateCheck";

const inflight = new Map<string, Promise<OgpData | OembedData>>();
const cache = new EmbedCache();

interface FetchState<T> {
    loading: boolean;
    data: T | null;
    error: string | null;
}

function useEmbedFetch<T extends OgpData | OembedData>(
    url: string,
    keyPrefix: "ogp" | "oembed",
    fetcher: (url: string) => Promise<T>,
): FetchState<T> {
    const [state, setState] = useState<FetchState<T>>({
        loading: true,
        data: null,
        error: null,
    });

    useEffect(() => {
        const cached = cache.get(url);
        if (cached) {
            setState({ loading: false, data: cached as T, error: null });
            return;
        }
        const cachedError = cache.getError(url);
        if (cachedError) {
            setState({ loading: false, data: null, error: cachedError });
            return;
        }

        let cancelled = false;
        const key = `${keyPrefix}:${url}`;
        let p = inflight.get(key);
        if (!p) {
            const fetched = fetcher(url);
            p = fetched.finally(() => inflight.delete(key));
            p.catch(() => {
                /* avoid unhandled rejection; subscribers handle errors separately */
            });
            inflight.set(key, p);
        }
        p.then((data) => {
            if (cancelled) return;
            cache.set(url, data);
            setState({ loading: false, data: data as T, error: null });
        }).catch((err: Error) => {
            if (cancelled) return;
            const msg = err.message || "fetch-failed";
            cache.setError(url, msg);
            setState({ loading: false, data: null, error: msg });
        });
        return () => {
            cancelled = true;
        };
    }, [url, keyPrefix, fetcher]);

    return state;
}

export function useOgpData(url: string, providers: EmbedProviders) {
    return useEmbedFetch<OgpData>(url, "ogp", providers.fetchOgp);
}

export function useOembedData(url: string, providers: EmbedProviders) {
    return useEmbedFetch<OembedData>(url, "oembed", providers.fetchOembed);
}

export type EmbedUpdateStatus = "loading" | "seen" | "unseen";

interface UpdateCheckHookResult {
    status: EmbedUpdateStatus;
    fingerprint: string | null;
    newTitle: string | null;
}

interface UpdateCheckParams {
    url: string;
    ogpData: OgpData | null;
    providers: EmbedProviders;
    baseline: EmbedBaseline;
    onInitialBaseline: (baseline: EmbedBaseline) => void;
    logger?: (level: "warn", msg: string) => void;
}

export function useEmbedUpdateCheck(params: UpdateCheckParams): UpdateCheckHookResult {
    const { url, ogpData, providers, baseline, onInitialBaseline, logger } = params;
    const [state, setState] = useState<UpdateCheckHookResult>({ status: "loading", fingerprint: null, newTitle: null });

    useEffect(() => {
        if (!ogpData) return;
        let cancelled = false;
        (async () => {
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
                    setState({ status: "seen", fingerprint: result.fingerprint, newTitle: null });
                    return;
                }
                if (result.kind === "updated") {
                    const seen = isEmbedSeen(url, result.fingerprint);
                    setState({
                        status: seen ? "seen" : "unseen",
                        fingerprint: result.fingerprint,
                        newTitle: result.newTitle,
                    });
                    return;
                }
                setState({ status: "seen", fingerprint: null, newTitle: null });
            } catch (e) {
                logger?.("warn", `embed update check failed: ${url} - ${(e as Error).message}`);
                if (!cancelled) setState({ status: "seen", fingerprint: null, newTitle: null });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [url, ogpData, providers, baseline, onInitialBaseline, logger]);

    return state;
}
