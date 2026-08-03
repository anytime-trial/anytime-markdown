/**
 * `collectClaudeCodeSessionDirs`（projects ディレクトリ → 取り込み対象の一覧）の特性化テスト。
 *
 * 直接呼ぶテストは 1 本も無かった（実測）。走査の取りこぼしは「セッションが数件少ない」形で
 * しか現れず、取り込み結果の件数を見るテストでは fixture に無い経路が黙って消えるため、
 * 分割前に「何を飛ばして何を拾うか」を固定する。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { collectClaudeCodeSessionDirs } from "../sessionDirs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SID2 = "11111111-2222-3333-4444-555555555555";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "session-dirs-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** projects/<project>/<sid>.jsonl を作る。cwd を渡すと repo 名の導出元になる。 */
function writeSession(project: string, sid: string, cwd?: string): string {
  const dir = path.join(root, project);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sid}.jsonl`);
  fs.writeFileSync(file, cwd ? `${JSON.stringify({ cwd })}\n` : "{}\n");
  return file;
}

/** projects/<project>/<sid>/subagents/<name> を作る。 */
function writeSubagent(project: string, sid: string, name: string): string {
  const dir = path.join(root, project, sid, "subagents");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, "{}\n");
  return file;
}

function collect(projectDirs: string[]): ReturnType<typeof collectClaudeCodeSessionDirs> {
  return collectClaudeCodeSessionDirs(projectDirs, root, UUID_RE);
}

describe("collectClaudeCodeSessionDirs — 拾うもの", () => {
  it("プロジェクトが無ければ空配列", () => {
    expect(collect([])).toEqual([]);
  });

  it("UUID 名の .jsonl を 1 セッションとして拾う", () => {
    const mainFile = writeSession("-proj", SID);
    expect(collect(["-proj"])).toEqual([
      { sid: SID, mainFile, subagentFiles: [], repoName: "proj", source: "claude_code" },
    ]);
  });

  it("複数プロジェクトを渡された順に連結する", () => {
    writeSession("-a", SID);
    writeSession("-b", SID2);
    expect(collect(["-a", "-b"]).map((d) => d.repoName)).toEqual(["a", "b"]);
  });

  it("同じプロジェクト内の複数セッションを拾う", () => {
    writeSession("-proj", SID);
    writeSession("-proj", SID2);
    expect(collect(["-proj"]).map((d) => d.sid).sort()).toEqual([SID2, SID].sort());
  });

  it("source は常に claude_code", () => {
    writeSession("-proj", SID);
    expect(collect(["-proj"])[0].source).toBe("claude_code");
  });
});

describe("collectClaudeCodeSessionDirs — 飛ばすもの", () => {
  it("存在しないプロジェクトディレクトリは飛ばす（例外にしない）", () => {
    expect(collect(["-missing"])).toEqual([]);
  });

  it("ディレクトリでないエントリは飛ばす", () => {
    fs.writeFileSync(path.join(root, "-file"), "not a dir");
    expect(collect(["-file"])).toEqual([]);
  });

  it(".jsonl でないファイルは飛ばす", () => {
    const dir = path.join(root, "-proj");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${SID}.json`), "{}");
    fs.writeFileSync(path.join(dir, `${SID}.jsonl.bak`), "{}");
    expect(collect(["-proj"])).toEqual([]);
  });

  it("ファイル名が UUID でない .jsonl は飛ばす", () => {
    const dir = path.join(root, "-proj");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "not-a-uuid.jsonl"), "{}");
    expect(collect(["-proj"])).toEqual([]);
  });

  it("あるプロジェクトが読めなくても後続のプロジェクトは処理する", () => {
    writeSession("-ok", SID);
    expect(collect(["-missing", "-ok"]).map((d) => d.sid)).toEqual([SID]);
  });
});

describe("collectClaudeCodeSessionDirs — subagent ファイル", () => {
  it("subagents ディレクトリが無ければ空配列（例外にしない）", () => {
    writeSession("-proj", SID);
    expect(collect(["-proj"])[0].subagentFiles).toEqual([]);
  });

  it("subagents 配下の .jsonl だけを拾う", () => {
    writeSession("-proj", SID);
    const kept = writeSubagent("-proj", SID, "agent-1.jsonl");
    writeSubagent("-proj", SID, "agent-1.meta.json");
    expect(collect(["-proj"])[0].subagentFiles).toEqual([kept]);
  });

  it("subagents は自分のセッションのものだけを拾う（別セッションのものは混ざらない）", () => {
    writeSession("-proj", SID);
    writeSession("-proj", SID2);
    writeSubagent("-proj", SID, "a.jsonl");
    const dirs = collect(["-proj"]);
    expect(dirs.find((d) => d.sid === SID)?.subagentFiles).toHaveLength(1);
    expect(dirs.find((d) => d.sid === SID2)?.subagentFiles).toEqual([]);
  });
});

describe("collectClaudeCodeSessionDirs — repo 名の導出", () => {
  it("JSONL から repo 名を取れなければディレクトリ名の先頭ハイフンを落として使う", () => {
    writeSession("---my-repo", SID);
    expect(collect(["---my-repo"])[0].repoName).toBe("my-repo");
  });

  it("ハイフンで始まらないディレクトリ名はそのまま使う", () => {
    writeSession("plain", SID);
    expect(collect(["plain"])[0].repoName).toBe("plain");
  });

  it("JSONL の cwd が実在するディレクトリなら、そちらの basename を使う", () => {
    const realCwd = path.join(root, "actual-repo");
    fs.mkdirSync(realCwd, { recursive: true });
    writeSession("-flattened-name", SID, realCwd);
    expect(collect(["-flattened-name"])[0].repoName).toBe("actual-repo");
  });
});
