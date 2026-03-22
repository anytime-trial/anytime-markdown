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

  it("filters out non-markdown files", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    const dirEntries = [
      { path: "README.md", type: "file", name: "README.md" },
      { path: "index.js", type: "file", name: "index.js" },
      { path: "notes.markdown", type: "file", name: "notes.markdown" },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(dirEntries) });

    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => {
      expect(screen.getByText("README.md")).toBeTruthy();
      expect(screen.getByText("notes.markdown")).toBeTruthy();
    });
    expect(screen.queryByText("index.js")).toBeNull();
  });

  it("calls onSelect when a file is clicked", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    const dirEntries = [
      { path: "README.md", type: "file", name: "README.md" },
    ];
    const onSelect = jest.fn();
    const onClose = jest.fn();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(dirEntries) });

    render(<GitHubRepoBrowser open={true} onClose={onClose} onSelect={onSelect} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.click(screen.getByText("README.md"));
    expect(onSelect).toHaveBeenCalledWith("user/repo1", "README.md");
    expect(onClose).toHaveBeenCalled();
  });

  it("goes back to repo list from directory view", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    const dirEntries = [
      { path: "README.md", type: "file", name: "README.md" },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(dirEntries) });

    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());

    const backButton = screen.getByLabelText("Go back");
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByText("Select Repository")).toBeTruthy();
    });
  });

  it("shows empty message when no markdown files in directory", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve([]) });

    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => {
      expect(screen.getByText("No Markdown files found")).toBeTruthy();
    });
  });

  it("shows fetch error as auth required", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network error"));
    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("GitHub authentication required")).toBeTruthy();
    });
  });

  it("navigates into subdirectory then back to parent", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    const rootEntries = [
      { path: "docs", type: "dir", name: "docs" },
    ];
    const subEntries = [
      { path: "docs/guide.md", type: "file", name: "guide.md" },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(rootEntries) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(subEntries) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(rootEntries) });

    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => expect(screen.getByText("docs")).toBeTruthy());
    fireEvent.click(screen.getByText("docs"));
    await waitFor(() => expect(screen.getByText("guide.md")).toBeTruthy());

    // 戻るで親ディレクトリに
    const backButton = screen.getByLabelText("Go back");
    fireEvent.click(backButton);
    await waitFor(() => expect(screen.getByText("docs")).toBeTruthy());
  });

  it("shows private repos with default branch info", async () => {
    const repos = [
      { fullName: "user/private-repo", private: true, defaultBranch: "main" },
    ];
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200, ok: true, json: () => Promise.resolve(repos),
    });
    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/private-repo")).toBeTruthy());
    expect(screen.getByText("Default: main")).toBeTruthy();
  });

  it("handles directory fetch error gracefully", async () => {
    const repos = [
      { fullName: "user/repo1", private: false, defaultBranch: "main" },
    ];
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve(repos) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.reject(new Error("fail")) });

    render(<GitHubRepoBrowser open={true} onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
    fireEvent.click(screen.getByText("user/repo1"));
    await waitFor(() => {
      expect(screen.getByText("No Markdown files found")).toBeTruthy();
    });
  });
});
