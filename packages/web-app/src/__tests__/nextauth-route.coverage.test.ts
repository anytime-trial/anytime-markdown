jest.mock("../../../../lib/githubAuth", () => ({
  handlers: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
}), { virtual: true });

jest.mock("../lib/githubAuth", () => ({
  handlers: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
}));

import { GET, POST } from "../app/api/auth/[...nextauth]/route";

describe("nextauth route", () => {
  it("exports GET and POST handlers", () => {
    expect(GET).toBeDefined();
    expect(POST).toBeDefined();
  });
});
