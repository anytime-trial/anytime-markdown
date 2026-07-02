interface V4Range {
    a: number;
    bMin?: number;
    bMax?: number;
}

const PRIVATE_V4_RANGES: readonly V4Range[] = [
    { a: 0 },
    { a: 10 },
    { a: 127 },
    { a: 169, bMin: 254, bMax: 254 },
    { a: 172, bMin: 16, bMax: 31 },
    { a: 192, bMin: 168, bMax: 168 },
];

const PRIVATE_V6_REGEX: readonly RegExp[] = [
    /^fc[0-9a-f]{2}:/,
    /^fd[0-9a-f]{2}:/,
    /^fe[89ab][0-9a-f]:/,
];

function matchesV4Range(a: number, b: number, range: V4Range): boolean {
    if (a !== range.a) return false;
    if (range.bMin === undefined) return true;
    return b >= range.bMin && b <= (range.bMax ?? range.bMin);
}

function isPrivateV4(a: number, b: number): boolean {
    return PRIVATE_V4_RANGES.some((range) => matchesV4Range(a, b, range));
}

export function isPrivateAddress(ip: string): boolean {
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (v4) return isPrivateV4(Number(v4[1]), Number(v4[2]));
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
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
