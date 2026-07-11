import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// next-intl は他の web-app テストと同様にキーをそのまま返すモックにする。
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { GitHubRepoBrowser } from "../components/GitHubRepoBrowser";

const REPOS = [{ fullName: "user/repo1", private: false, defaultBranch: "main" }];

/** URL でディスパッチする fetch モック。呼び出し順に依存しない。 */
function mockFetch(options: {
  repos?: unknown;
  branches?: unknown;
  entriesByRef?: Record<string, unknown>;
  reposStatus?: number;
  branchesOk?: boolean;
}): jest.Mock {
  const fn = jest.fn((input: string) => {
    const url = String(input);
    if (url.startsWith("/api/github/repos")) {
      const status = options.reposStatus ?? 200;
      return Promise.resolve({
        status,
        ok: status === 200,
        json: () => Promise.resolve(options.repos ?? REPOS),
      });
    }
    if (url.startsWith("/api/github/branches")) {
      const ok = options.branchesOk ?? true;
      return Promise.resolve({
        status: ok ? 200 : 500,
        ok,
        json: () => Promise.resolve(options.branches ?? ["main", "develop"]),
      });
    }
    if (url.startsWith("/api/github/content")) {
      const ref = new URLSearchParams(url.split("?")[1]).get("ref") ?? "";
      const entries = options.entriesByRef?.[ref] ?? [];
      return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(entries) });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  (global.fetch as unknown) = fn;
  return fn;
}

/** リポジトリ一覧を待ってから repo1 を選択する。 */
async function selectRepo(): Promise<void> {
  await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
  fireEvent.click(screen.getByText("user/repo1"));
}

describe("GitHubRepoBrowser", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("open のときダイアログのタイトルを表示する", () => {
    mockFetch({ repos: [] });
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    expect(screen.getByText("githubOpenSelectRepo")).toBeTruthy();
  });

  it("closed のとき内容を描画しない", () => {
    mockFetch({});
    render(<GitHubRepoBrowser open={false} onClose={jest.fn()} onSelect={jest.fn()} />);
    expect(screen.queryByText("githubOpenSelectRepo")).toBeFalsy();
  });

  it("401 ならサインインボタンを表示する", async () => {
    mockFetch({ reposStatus: 401 });
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("githubOpenSignInButton")).toBeTruthy());
  });

  it("403（スコープ不足）なら再サインインを促す", async () => {
    (global.fetch as unknown) = jest.fn(() =>
      Promise.resolve({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: "insufficient_scope" }),
      }),
    );
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("githubOpenScopeUpgrade")).toBeTruthy());
    expect(screen.getByText("githubOpenSignInButton")).toBeTruthy();
  });

  it("fetch 失敗も認証要求として扱う", async () => {
    (global.fetch as unknown) = jest.fn(() => Promise.reject(new Error("network error")));
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("githubOpenSignInRequired")).toBeTruthy());
  });

  it("リポジトリ一覧を描画する", async () => {
    mockFetch({});
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("user/repo1")).toBeTruthy());
  });

  it("リポジトリ選択でディレクトリ内容を既定ブランチで取得する", async () => {
    const fetchMock = mockFetch({
      entriesByRef: {
        main: [
          { path: "docs", type: "dir", name: "docs" },
          { path: "readme.md", type: "file", name: "readme.md" },
        ],
      },
    });
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await selectRepo();
    await waitFor(() => {
      expect(screen.getByText("docs")).toBeTruthy();
      expect(screen.getByText("readme.md")).toBeTruthy();
    });
    const contentCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/github/content"),
    );
    expect(String(contentCall?.[0])).toContain("ref=main");
  });

  it("markdown 以外のファイルを除外する", async () => {
    mockFetch({
      entriesByRef: {
        main: [
          { path: "README.md", type: "file", name: "README.md" },
          { path: "index.js", type: "file", name: "index.js" },
          { path: "notes.markdown", type: "file", name: "notes.markdown" },
        ],
      },
    });
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await selectRepo();
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    expect(screen.getByText("notes.markdown")).toBeTruthy();
    expect(screen.queryByText("index.js")).toBeNull();
  });

  it("ファイルクリックで onSelect に repo / path / branch を渡し閉じる", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    mockFetch({ entriesByRef: { main: [{ path: "README.md", type: "file", name: "README.md" }] } });
    render(<GitHubRepoBrowser open onClose={onClose} onSelect={onSelect} />);
    await selectRepo();
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.click(screen.getByText("README.md"));
    expect(onSelect).toHaveBeenCalledWith("user/repo1", "README.md", "main");
    expect(onClose).toHaveBeenCalled();
  });

  it("ディレクトリ表示から戻るとリポジトリ一覧へ戻る", async () => {
    mockFetch({ entriesByRef: { main: [{ path: "README.md", type: "file", name: "README.md" }] } });
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await selectRepo();
    await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("githubOpenBack"));
    await waitFor(() => expect(screen.getByText("githubOpenSelectRepo")).toBeTruthy());
  });

  it("markdown が無いディレクトリでは空メッセージを出す", async () => {
    mockFetch({ entriesByRef: { main: [] } });
    render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
    await selectRepo();
    await waitFor(() => expect(screen.getByText("githubOpenNoMarkdown")).toBeTruthy());
  });

  describe("ブランチ選択", () => {
    it("リポジトリ選択後にブランチ候補を取得して表示する", async () => {
      mockFetch({ branches: ["main", "develop"], entriesByRef: { main: [] } });
      render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
      await selectRepo();
      await waitFor(() => {
        const input = screen.getByLabelText("githubOpenBranchLabel") as HTMLInputElement;
        expect(input.value).toBe("main");
      });
    });

    it("ブランチを切り替えるとそのブランチでツリーを再取得する", async () => {
      const fetchMock = mockFetch({
        branches: ["main", "develop"],
        entriesByRef: {
          main: [{ path: "main.md", type: "file", name: "main.md" }],
          develop: [{ path: "dev.md", type: "file", name: "dev.md" }],
        },
      });
      render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
      await selectRepo();
      await waitFor(() => expect(screen.getByText("main.md")).toBeTruthy());

      const input = screen.getByLabelText("githubOpenBranchLabel");
      fireEvent.mouseDown(input);
      await waitFor(() => expect(screen.getByText("develop")).toBeTruthy());
      fireEvent.click(screen.getByText("develop"));

      await waitFor(() => expect(screen.getByText("dev.md")).toBeTruthy());
      expect(screen.queryByText("main.md")).toBeNull();
      const refs = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.startsWith("/api/github/content"));
      expect(refs.at(-1)).toContain("ref=develop");
    });

    it("切り替えたブランチが onSelect の第 3 引数に渡る", async () => {
      const onSelect = jest.fn();
      mockFetch({
        branches: ["main", "develop"],
        entriesByRef: {
          main: [],
          develop: [{ path: "dev.md", type: "file", name: "dev.md" }],
        },
      });
      render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={onSelect} />);
      await selectRepo();
      await waitFor(() => expect(screen.getByText("githubOpenNoMarkdown")).toBeTruthy());

      fireEvent.mouseDown(screen.getByLabelText("githubOpenBranchLabel"));
      await waitFor(() => expect(screen.getByText("develop")).toBeTruthy());
      fireEvent.click(screen.getByText("develop"));

      await waitFor(() => expect(screen.getByText("dev.md")).toBeTruthy());
      fireEvent.click(screen.getByText("dev.md"));
      expect(onSelect).toHaveBeenCalledWith("user/repo1", "dev.md", "develop");
    });

    it("ブランチ連続切替で古い応答が後着しても新しいツリーを上書きしない", async () => {
      // develop の応答を main より遅らせ、後着させる。
      const resolvers: Array<() => void> = [];
      (global.fetch as unknown) = jest.fn((input: string) => {
        const url = String(input);
        if (url.startsWith("/api/github/repos")) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(REPOS) });
        }
        if (url.startsWith("/api/github/branches")) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(["main", "develop"]) });
        }
        const ref = new URLSearchParams(url.split("?")[1]).get("ref") ?? "";
        const entries =
          ref === "main"
            ? [{ path: "main.md", type: "file", name: "main.md" }]
            : [{ path: "dev.md", type: "file", name: "dev.md" }];
        if (ref === "main") {
          // main の応答を保留し、develop 選択後に解決させる。
          return new Promise((resolve) => {
            resolvers.push(() =>
              resolve({ status: 200, ok: true, json: () => Promise.resolve(entries) }),
            );
          });
        }
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(entries) });
      });

      render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
      await selectRepo(); // main のツリー取得は保留される

      fireEvent.mouseDown(screen.getByLabelText("githubOpenBranchLabel"));
      await waitFor(() => expect(screen.getByText("develop")).toBeTruthy());
      fireEvent.click(screen.getByText("develop"));
      await waitFor(() => expect(screen.getByText("dev.md")).toBeTruthy());

      // ここで main（古いリクエスト）の応答が後着する
      await act(async () => {
        resolvers.forEach((r) => r());
      });

      expect(screen.getByText("dev.md")).toBeTruthy();
      expect(screen.queryByText("main.md")).toBeNull();
    });

    it("ブランチ取得に失敗しても既定ブランチで続行する", async () => {
      mockFetch({
        branchesOk: false,
        entriesByRef: { main: [{ path: "README.md", type: "file", name: "README.md" }] },
      });
      render(<GitHubRepoBrowser open onClose={jest.fn()} onSelect={jest.fn()} />);
      await selectRepo();
      await waitFor(() => expect(screen.getByText("README.md")).toBeTruthy());
      const input = screen.getByLabelText("githubOpenBranchLabel") as HTMLInputElement;
      expect(input.value).toBe("main");
    });
  });
});
