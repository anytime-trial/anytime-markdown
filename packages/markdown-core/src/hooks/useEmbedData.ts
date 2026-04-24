import { useEffect, useState } from "react";

import type { EmbedProviders, OembedData, OgpData } from "../types/embedProvider";
import { EmbedCache } from "../utils/embedCache";

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
