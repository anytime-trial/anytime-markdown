"use client";

import { createContext, useContext } from "react";

import type { EmbedProviders } from "@anytime-markdown/markdown-viewer/src/types/embedProvider";

const ctx = createContext<EmbedProviders | null>(null);

export const EmbedProvidersProvider = ctx.Provider;

export function useEmbedProviders(): EmbedProviders {
    const v = useContext(ctx);
    if (!v) throw new Error("EmbedProviders not injected");
    return v;
}

export function useOptionalEmbedProviders(): EmbedProviders | null {
    return useContext(ctx);
}
