#!/usr/bin/env tsx
// ドキュメント索引（index.<lang>.md）をフォルダ単位で生成する CLI。
//
// 実装の正本は packages/doc-core/src/folderIndex/（冪等生成・jest テスト付き）。
// 本ファイルは CLI 引数の解釈だけを行う薄いラッパーで、npm scripts
// （spec:index / tech:index / proposal:index / review:index / report:index）から
// tsx 経由で実行される（素の node は doc-core の TypeScript を読めない）。
//
// import はワークスペース名でなくリポジトリ相対にする: worktree では node_modules の
// ワークスペース symlink が main チェックアウト側の doc-core へ解決され、編集中の
// 実装と食い違うため（@anytime-markdown/* は使わない）。
//
// 使い方: tsx scripts/gen-spec-index.mjs [docDir] [scopeLabel] [lang]
//   docDir 既定: /Shared/anytime-markdown-docs/spec
//   scopeLabel 既定: 設計書（タイトル先頭に使う表示名） / lang 既定: ja

import path from 'node:path';
import { generateDocIndexes } from '../packages/doc-core/src/folderIndex/generateDocIndexes.ts';

function main() {
  const docDir = path.resolve(process.argv[2] ?? '/Shared/anytime-markdown-docs/spec');
  const scopeLabel = process.argv[3] ?? '設計書';
  const lang = process.argv[4] ?? 'ja';
  let result;
  try {
    result = generateDocIndexes({
      docDir,
      scopeLabel,
      lang,
      onWarn: (message) => process.stderr.write(`${message}\n`),
    });
  } catch (err) {
    process.stderr.write(`[gen-doc-index] ${String(err instanceof Error ? err.message : err)}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `[gen-doc-index] wrote ${result.written}, unchanged ${result.unchanged} folder indexes under ${docDir}\n`,
  );
}

main();
