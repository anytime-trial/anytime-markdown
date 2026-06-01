import { isPrivateAddress, assertSafeUrl } from "../../utils/ssrfGuard";

jest.mock("node:dns/promises", () => ({
    lookup: jest.fn(),
}));

import { lookup } from "node:dns/promises";
const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

describe("isPrivateAddress", () => {
    test.each([
        "127.0.0.1", "10.0.0.1", "10.255.255.255",
        "172.16.0.1", "172.31.255.255",
        "192.168.0.1", "192.168.255.255",
        "169.254.169.254", "0.0.0.0",
        "::1", "fc00::1", "fe80::1",
    ])("private %s", (ip) => {
        expect(isPrivateAddress(ip)).toBe(true);
    });

    test.each([
        "8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1",
        "2606:4700:4700::1111",
    ])("public %s", (ip) => {
        expect(isPrivateAddress(ip)).toBe(false);
    });
});

describe("assertSafeUrl", () => {
    beforeEach(() => jest.clearAllMocks());

    test("rejects non-http/https schemes", async () => {
        await expect(assertSafeUrl("ftp://example.com/file")).rejects.toThrow("scheme-not-allowed");
        await expect(assertSafeUrl("javascript:alert(1)")).rejects.toThrow("scheme-not-allowed");
    });

    test("accepts https URL resolving to public IP", async () => {
        mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
        await expect(assertSafeUrl("https://dns.google")).resolves.toBeUndefined();
    });

    test("rejects URL resolving to private IP", async () => {
        mockLookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }] as never);
        await expect(assertSafeUrl("https://internal.example.com")).rejects.toThrow("private-address");
    });

    test("rejects URL resolving to loopback", async () => {
        mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
        await expect(assertSafeUrl("http://localhost")).rejects.toThrow("private-address");
    });

    test("rejects if any resolved address is private", async () => {
        mockLookup.mockResolvedValue([
            { address: "8.8.8.8", family: 4 },
            { address: "192.168.1.1", family: 4 },
        ] as never);
        await expect(assertSafeUrl("https://mixed.example.com")).rejects.toThrow("private-address");
    });
});
