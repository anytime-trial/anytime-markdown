import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// wrangler.jsonc の alias は deploy 時の esbuild だけが解決し、jest・tsc は通らない。
// 2026-04-04 に削除した ./src/empty.ts を指す alias が残り、2026-10-11 の SDK 更新で deploy が落ちた。
const pkgRoot = resolve(__dirname, '../..');

function readWranglerConfig(): { alias?: Record<string, string> } {
  const raw = readFileSync(resolve(pkgRoot, 'wrangler.jsonc'), 'utf8');
  const json = raw.replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(json) as { alias?: Record<string, string> };
}

describe('wrangler.jsonc', () => {
  it('alias の相対パスはすべて実在するファイルを指す', () => {
    const alias = readWranglerConfig().alias ?? {};
    const missing = Object.entries(alias)
      .filter(([, target]) => target.startsWith('.'))
      .filter(([, target]) => !existsSync(resolve(pkgRoot, target)));
    expect(missing).toEqual([]);
  });

  it('MCP SDK が実行時に使う content-type を差し替えない', () => {
    const alias = readWranglerConfig().alias ?? {};
    expect(alias).not.toHaveProperty('content-type');
  });
});
