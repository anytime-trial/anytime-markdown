import { isPrivateAddress } from "../../utils/ssrfGuard";

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
