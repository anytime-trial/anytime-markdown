// __non_webpack_require__ は webpack グローバル。テスト環境では sql-asm.js を直接ロードする。
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn() };
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';

describe('TrailDataServer static assets', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let distDir: string;

  beforeEach(async () => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-static-assets-'));
    fs.writeFileSync(path.join(distDir, 'trailstandalone.js'), 'globalThis.__trail_asset_loaded = true;');
    db = await createTestTrailDatabase();
    server = new TrailDataServer(distDir, db);
    await server.start(0);
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('serves standalone HTML and JS with cache busting disabled browser cache', async () => {
    const root = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get('cache-control')).toContain('no-store');
    const html = await root.text();
    const scriptMatch = /<script src="([^"]+)"><\/script>/.exec(html);
    expect(scriptMatch?.[1]).toMatch(/^\/trailstandalone\.js\?v=\d+$/);

    const script = await fetch(`http://127.0.0.1:${server.port}${scriptMatch?.[1]}`);
    expect(script.status).toBe(200);
    expect(script.headers.get('cache-control')).toContain('no-store');
    expect(await script.text()).toContain('__trail_asset_loaded');
  });
});
