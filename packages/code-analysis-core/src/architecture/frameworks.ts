import type {
  DependencySource,
  FileMarker,
  FrameworkDetection,
  FrameworkId,
  ModuleManifest,
} from './types';

interface FrameworkSignature {
  readonly id: FrameworkId;
  readonly pattern: RegExp;
}

/**
 * 依存名 → フレークワーク署名。ビルドツール（esbuild/webpack/tsup/rollup）は
 * 意味的ノイズのため意図的に含めない（PoC #2 の対策）。
 */
const SIGNATURES: readonly FrameworkSignature[] = [
  { id: 'nextjs', pattern: /^next$/ },
  { id: 'astro', pattern: /^astro$/ },
  { id: 'react', pattern: /^react(-dom)?$/ },
  { id: 'vue', pattern: /^vue$/ },
  { id: 'vite', pattern: /^vite$/ },
  { id: 'mcp-sdk', pattern: /^@modelcontextprotocol\/sdk$/ },
  { id: 'sqlite', pattern: /^(better-sqlite3|sql\.js)$|^@libsql\// },
  { id: 'tree-sitter', pattern: /^web-tree-sitter$|^tree-sitter/ },
  { id: 'ollama', pattern: /^ollama$/ },
  { id: 'supabase', pattern: /^@supabase\/supabase-js$/ },
  { id: 'aws-s3', pattern: /^@aws-sdk\/|^aws-sdk$/ },
  { id: 'zod', pattern: /^zod$/ },
  { id: 'prosemirror', pattern: /^@tiptap\/|^prosemirror/ },
  { id: 'sigma', pattern: /^sigma$|^graphology/ },
  { id: 'markdown-render', pattern: /^katex$|^highlight\.js$|^marked$|^markdown-it/ },
  { id: 'express', pattern: /^express$/ },
  { id: 'fastify', pattern: /^fastify$/ },
  { id: 'hono', pattern: /^hono$/ },
  { id: 'mui', pattern: /^@mui\// },
  { id: 'charting', pattern: /^d3(-|$)/ },
  // VS Code 拡張は engines.vscode が主シグナルだが、型のみ依存も拾う
  { id: 'vscode-extension', pattern: /^@types\/vscode$/ },
];

/** ソース重み。重複検出時の採用と confidence 算定に使う。 */
const SOURCE_WEIGHT: Readonly<Record<DependencySource, number>> = {
  runtime: 1,
  engine: 1,
  marker: 0.9,
  peer: 0.7,
  dev: 0.4,
};

/** マーカー → フレームワーク。devDep に隠れた利用を runtime 同等に昇格させる（PoC #1 の対策）。 */
const MARKER_FRAMEWORK: Partial<Record<FileMarker, FrameworkId>> = {
  'next.config': 'nextjs',
  'vite.config': 'vite',
  'astro.config': 'astro',
  'ts-compiler-import': 'ts-compiler',
  'sqlite-schema': 'sqlite',
  wasm: 'tree-sitter',
};

/**
 * モジュールの使用フレームワークを決定論で検出する。
 * 同一 framework が複数ソースで検出された場合は最も重いソースを採用する。
 * 返り値は id 昇順でソート済み（再実行で同一）。
 */
export function detectFrameworks(manifest: ModuleManifest): FrameworkDetection[] {
  const best = new Map<FrameworkId, DependencySource>();

  const consider = (id: FrameworkId, source: DependencySource): void => {
    const current = best.get(id);
    if (current === undefined || SOURCE_WEIGHT[source] > SOURCE_WEIGHT[current]) {
      best.set(id, source);
    }
  };

  const scan = (
    deps: Readonly<Record<string, string>> | undefined,
    source: DependencySource,
  ): void => {
    if (!deps) return;
    for (const dep of Object.keys(deps)) {
      for (const sig of SIGNATURES) {
        if (sig.pattern.test(dep)) consider(sig.id, source);
      }
    }
  };

  scan(manifest.dependencies, 'runtime');
  scan(manifest.peerDependencies, 'peer');
  scan(manifest.devDependencies, 'dev');

  if (manifest.engines && 'vscode' in manifest.engines) {
    consider('vscode-extension', 'engine');
  }

  for (const marker of manifest.markers ?? []) {
    const id = MARKER_FRAMEWORK[marker];
    if (id) consider(id, 'marker');
  }

  return [...best.entries()]
    .map(([id, source]) => ({ id, source }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export { SOURCE_WEIGHT };
