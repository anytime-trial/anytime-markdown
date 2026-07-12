const PRIVATE_V4_CIDRS: readonly (readonly [string, number])[] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
];

const PRIVATE_V6_REGEX: readonly RegExp[] = [
    /^fc[0-9a-f]{2}:/,
    /^fd[0-9a-f]{2}:/,
    /^fe[89ab][0-9a-f]:/,
];

const REDIRECT_STATUSES: readonly number[] = [301, 302, 303, 307, 308];
const MAX_REDIRECTS = 5;

function toUint32(ip: string): number | undefined {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (!m) return undefined;
    const octets = m.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return undefined;
    return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isPrivateV4(ip: string): boolean {
    const value = toUint32(ip);
    if (value === undefined) return false;
    return PRIVATE_V4_CIDRS.some(([base, bits]) => {
        const network = toUint32(base);
        if (network === undefined) return false;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (value & mask) >>> 0 === network;
    });
}

export function isPrivateAddress(ip: string): boolean {
    const lower = ip.toLowerCase();
    // IPv4-mapped IPv6 (::ffff:127.0.0.1) reaches the same host as its IPv4 form.
    const mapped = lower.startsWith("::ffff:") ? lower.slice("::ffff:".length) : lower;
    if (isPrivateV4(mapped)) return true;
    if (lower === "::1" || lower === "::") return true;
    return PRIVATE_V6_REGEX.some((re) => re.test(lower));
}

export async function assertSafeUrl(url: string): Promise<void> {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("scheme-not-allowed");
    }
    const { lookup } = await import("node:dns/promises");
    const records = await lookup(u.hostname, { all: true });
    for (const r of records) {
        if (isPrivateAddress(r.address)) throw new Error("private-address");
    }
}

/**
 * Fetches `url`, validating every hop against {@link assertSafeUrl}.
 *
 * Redirects are resolved manually: letting fetch follow them would only validate
 * the first URL, so any public host could bounce the request to a private address.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
    let target = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertSafeUrl(target);
        const res = await fetch(target, { ...init, redirect: "manual" });
        if (!REDIRECT_STATUSES.includes(res.status)) return res;

        const location = res.headers.get("location");
        if (!location) throw new Error("redirect-without-location");
        target = new URL(location, target).toString();
    }
    throw new Error("too-many-redirects");
}
