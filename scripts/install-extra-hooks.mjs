//
// husky が生成しないフックのラッパーを .husky/_/ に置く。
//
// husky 9 は既知のフック名（post-commit / pre-commit 等）のラッパーしか生成しない。
// reference-transaction はそのリストに無いため、core.hooksPath=.husky/_ の下に
// ラッパーが存在せず、フックが発火しない。prepare から本スクリプトを呼んで補う。
//
// SHORTCUT: worktree では npm install（= prepare）が走るまでフックが 1 つも発火しない.
// ceiling: core.hooksPath は `.husky/_` の相対パスで、git はこれを各 worktree の top-level 基準で
// 解決する。`.husky/_` は gitignore された husky 生成物のため、`git worktree add` 直後の worktree には
// 存在しない。git-activity だけでなく既存の pre-commit（データ損失防止ゲート）も同様に発火しない.
// upgrade: worktree でのフック不発が実害になったら、prepare で core.hooksPath を絶対パスへ書き換える
// （.git/config はワークツリー間で共有されるため全 worktree に効く）。リポジトリ移動時に
// npm install し直す必要が生じるトレードオフを伴う.

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXTRA_HOOKS = ['reference-transaction'];
const WRAPPER = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n';

const husky = join(process.cwd(), '.husky', '_');

if (!existsSync(join(husky, 'h'))) {
  process.exit(0);
}

mkdirSync(husky, { recursive: true });
for (const hook of EXTRA_HOOKS) {
  const path = join(husky, hook);
  writeFileSync(path, WRAPPER);
  chmodSync(path, 0o755);
}
