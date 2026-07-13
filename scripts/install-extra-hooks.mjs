//
// husky が生成しないフックのラッパーを .husky/_/ に置く。
//
// husky 9 は既知のフック名（post-commit / pre-commit 等）のラッパーしか生成しない。
// reference-transaction はそのリストに無いため、core.hooksPath=.husky/_ の下に
// ラッパーが存在せず、フックが発火しない。prepare から本スクリプトを呼んで補う。

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
