jest.mock("next/og", () => ({
  ImageResponse: class MockImageResponse {
    constructor(public element: any, public options: any) {}
  },
}));

import * as twitterImage from "../app/twitter-image";

describe("twitter-image", () => {
  it("re-exports opengraph-image members", () => {
    expect(twitterImage.runtime).toBe("nodejs");
    expect(twitterImage.alt).toBeDefined();
    expect(twitterImage.size).toBeDefined();
    expect(twitterImage.contentType).toBeDefined();
    expect(typeof twitterImage.default).toBe("function");
  });
});
