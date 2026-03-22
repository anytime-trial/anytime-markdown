import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { GitHubRepoBrowser } from "../components/GitHubRepoBrowser";

describe("GitHubRepoBrowser", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders dialog with title when open", () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    expect(screen.getByText("Select Repository")).toBeTruthy();
  });

  it("does not render when closed", () => {
    const { container } = render(<GitHubRepoBrowser open={false} onClose={jest.fn()} onSelect={jest.fn()} />);
    // Dialog should not show content when closed (MUI renders but hidden)
    expect(screen.queryByText("Select Repository")).toBeFalsy();
  });

  it("shows auth button on 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 401,
      ok: false,
      json: () => Promise.resolve([]),
    });
    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Sign in with GitHub")).toBeTruthy();
    });
  });

  it("renders repo list after fetch", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve(repos),
    });
    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("user/repo1")).toBeTruthy();
    });
  });

  it("navigates into repo and shows directory contents", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    const dirEntries = [
      { path: "docs", type: "dir", name: "docs" },
      { path: "readme.md", type: "file", name: "readme.md" },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(dirEntries) });

    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => {
      expect(screen.getByText("docs")).toBeTruthy();
      expect(screen.getByText("readme.md")).toBeTruthy();
    });
  });
});
