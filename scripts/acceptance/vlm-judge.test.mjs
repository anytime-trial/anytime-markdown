import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildJudgePrompt,
  collectVrtArtifacts,
  parseJudgeResponse,
  resolveDocsRoot,
  runVlmJudge,
} from "./vlm-judge.mjs";

test("buildJudgePrompt はルーブリックと画面名と JSON 指示を含む", () => {
  const prompt = buildJudgePrompt("# デザイン規約\nトークン駆動。", "editor-initial-light");
  assert.match(prompt, /editor-initial-light/);
  assert.match(prompt, /トークン駆動/);
  assert.match(prompt, /"score"/);
});

test("parseJudgeResponse は前後に説明文があっても JSON を取り出す", () => {
  const parsed = parseJudgeResponse('採点します。\n{"score": 7, "issues": ["余白が不揃い"]}\n以上です。');
  assert.deepEqual(parsed, { score: 7, issues: ["余白が不揃い"] });
});

test("parseJudgeResponse は不正応答を null にする（score 域外・issues 型不正・非 JSON）", () => {
  assert.equal(parseJudgeResponse("no json here"), null);
  assert.equal(parseJudgeResponse('{"score": 99, "issues": []}'), null);
  assert.equal(parseJudgeResponse('{"score": 5, "issues": [1]}'), null);
  assert.equal(parseJudgeResponse(undefined), null);
});

test("collectVrtArtifacts は test-results から actual/diff の対を再帰収集する", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlm-artifacts-"));
  const sub = path.join(dir, "vrt-light-case");
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, "shot-actual.png"), "x");
  fs.writeFileSync(path.join(sub, "shot-diff.png"), "x");
  const noDiff = path.join(dir, "vrt-dark-case");
  fs.mkdirSync(noDiff, { recursive: true });
  fs.writeFileSync(path.join(noDiff, "shot-actual.png"), "x");

  const artifacts = collectVrtArtifacts(dir).sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].name, "vrt-dark-case");
  assert.equal(artifacts[0].diffPath, null);
  assert.equal(artifacts[1].name, "vrt-light-case");
  assert.ok(artifacts[1].diffPath?.endsWith("shot-diff.png"));
  assert.deepEqual(collectVrtArtifacts(path.join(dir, "missing")), []);
});

test("resolveDocsRoot は CLAUDE.md の docsRoot 行を解決し、無ければ null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlm-docsroot-"));
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "## ドキュメント保存先\n\n- docsRoot: /Shared/example-docs\n");
  assert.equal(resolveDocsRoot(dir), "/Shared/example-docs");
  assert.equal(resolveDocsRoot(path.join(dir, "missing")), null);
});

test("runVlmJudge はモデル未設定・ルーブリック欠落・ollama 不達で skip を返す", async () => {
  const unset = await runVlmJudge({ model: "", rubricPath: "/tmp/x.md", artifacts: [] });
  assert.equal(unset.skipped, true);
  assert.match(unset.reason, /ACCEPTANCE_VLM_MODEL/);

  const noRubric = await runVlmJudge({ model: "llava", rubricPath: "/nonexistent/rubric.md", artifacts: [] });
  assert.equal(noRubric.skipped, true);
  assert.match(noRubric.reason, /rubric not found/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlm-rubric-"));
  const rubricPath = path.join(dir, "design.md");
  fs.writeFileSync(rubricPath, "# rubric");
  const unreachable = await runVlmJudge({
    model: "llava",
    rubricPath,
    artifacts: [],
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(unreachable.skipped, true);
  assert.match(unreachable.reason, /ollama unreachable/);
});

test("runVlmJudge は到達可なら画像ごとに採点し、失敗画像はエラーとして残す", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vlm-run-"));
  const rubricPath = path.join(dir, "design.md");
  fs.writeFileSync(rubricPath, "# rubric");
  const img = path.join(dir, "a-actual.png");
  fs.writeFileSync(img, Buffer.from([1, 2, 3]));

  const fetchImpl = async (url) => {
    if (String(url).endsWith("/api/tags")) return { ok: true };
    return {
      ok: true,
      json: async () => ({ message: { content: '{"score": 9, "issues": []}' } }),
    };
  };
  const ok = await runVlmJudge({
    model: "llava",
    rubricPath,
    artifacts: [{ name: "a", actualPath: img, diffPath: null }],
    fetchImpl,
  });
  assert.equal(ok.skipped, false);
  assert.deepEqual(ok.results, [{ name: "a", score: 9, issues: [] }]);

  const failing = await runVlmJudge({
    model: "llava",
    rubricPath,
    artifacts: [{ name: "b", actualPath: img, diffPath: null }],
    fetchImpl: async (url) => {
      if (String(url).endsWith("/api/tags")) return { ok: true };
      return { ok: false, status: 500 };
    },
  });
  assert.equal(failing.skipped, false);
  assert.equal(failing.results[0].name, "b");
  assert.match(failing.results[0].error, /HTTP 500/);
});
