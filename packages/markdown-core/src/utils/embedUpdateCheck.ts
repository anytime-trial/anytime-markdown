import type { OgpData, EmbedProviders } from "../types/embedProvider";
import type { EmbedBaseline } from "./embedInfoString";
import { discoverRssFeed } from "./rssDiscovery";
import type { RssLatest } from "./rssParser";
import { buildOgpFingerprint, buildRssFingerprint } from "./ogpFingerprint";

export type UpdateCheckResult =
    | { kind: "initial"; baseline: EmbedBaseline; fingerprint: string }
    | { kind: "updated"; fingerprint: string; newTitle: string | null }
    | { kind: "unchanged" };

interface CheckInput {
    url: string;
    ogpData: OgpData;
    ogpHtml: string | null;
    providers: Pick<EmbedProviders, "fetchRss">;
    baseline: EmbedBaseline;
    logger?: (level: "warn", msg: string) => void;
}

export async function checkEmbedUpdate(input: CheckInput): Promise<UpdateCheckResult> {
    const { url, ogpData, ogpHtml, providers, baseline, logger } = input;

    if (!baseline.rssChecked) {
        const rssFeedUrl = ogpHtml ? discoverRssFeed(ogpHtml, url) : null;
        let rssLatest: RssLatest | null = null;
        if (rssFeedUrl) {
            try {
                rssLatest = await providers.fetchRss(rssFeedUrl);
            } catch (e) {
                logger?.("warn", `rss fetch failed: ${url} - ${(e as Error).message}`);
            }
        }
        const ogpHash = await buildOgpFingerprint(ogpData);
        const newBaseline: EmbedBaseline = {
            rssFeedUrl,
            rssChecked: true,
            baselineRssGuid: rssLatest?.guid ?? null,
            baselineOgpHash: ogpHash,
        };
        const fingerprint = rssLatest ? buildRssFingerprint(rssLatest) : ogpHash;
        return { kind: "initial", baseline: newBaseline, fingerprint };
    }

    if (baseline.rssFeedUrl) {
        try {
            const latest = await providers.fetchRss(baseline.rssFeedUrl);
            if (latest.guid !== baseline.baselineRssGuid) {
                return { kind: "updated", fingerprint: buildRssFingerprint(latest), newTitle: latest.title };
            }
            return { kind: "unchanged" };
        } catch (e) {
            logger?.("warn", `rss fetch failed: ${url} - ${(e as Error).message}`);
            return { kind: "unchanged" };
        }
    }

    const currentHash = await buildOgpFingerprint(ogpData);
    if (currentHash !== baseline.baselineOgpHash) {
        return { kind: "updated", fingerprint: currentHash, newTitle: ogpData.title };
    }
    return { kind: "unchanged" };
}
