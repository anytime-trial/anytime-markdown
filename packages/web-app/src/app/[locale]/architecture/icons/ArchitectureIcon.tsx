import Extension from '@mui/icons-material/Extension';
import Storage from '@mui/icons-material/Storage';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ReactElement } from 'react';

import {
  siClaude,
  siCloudflareworkers,
  siGithub,
  siGooglechrome,
  siGoogledrive,
  siJson,
  siMarkdown,
  siModelcontextprotocol,
  siNextdotjs,
  siOllama,
  siPython,
  siSqlite,
  siSupabase,
  siTypescript,
  // simple-icons から必要分のみ抽出した生成ファイル。simple-icons 全体（約 5 MiB）を
  // バンドルへ取り込まないための分離レイヤー。再生成: npm run gen:architecture-icons
} from './architectureIcons.generated';

/**
 * 図中のインラインアイコンの一辺（px）。デザインシステム §8 のナビ・ボタン 24px は
 * ノードチップ（フォント 0.75rem）には大きすぎるため、チップ専用の寸法を持つ。
 */
const ICON_SIZE = 14;

/**
 * ブランドマークを持つノード用のアイコン。値は simple-icons の 24×24 viewBox の path。
 *
 * Why not: ブランドカラー（`hex`）を使わない。GitHub `#181717` や Ollama `#000000` の
 * ような暗色マークはダークモードで背景へ沈む。デザインシステム §8 のニュートラル
 * アイコン（`text.primary`）に合わせ、単色 `currentColor` で描く。
 */
const BRAND_ICON_PATHS = {
  claude: siClaude.path,
  cloudflareWorkers: siCloudflareworkers.path,
  github: siGithub.path,
  googleChrome: siGooglechrome.path,
  googleDrive: siGoogledrive.path,
  json: siJson.path,
  markdown: siMarkdown.path,
  mcp: siModelcontextprotocol.path,
  nextjs: siNextdotjs.path,
  ollama: siOllama.path,
  python: siPython.path,
  sqlite: siSqlite.path,
  supabase: siSupabase.path,
  typescript: siTypescript.path,
} as const;

/**
 * ブランドマークが CC0 で入手できないノード用のフォールバック。
 *
 * Why not: Amazon S3 と VS Code のマークは simple-icons 16.x から商標方針により
 * 削除されている。ロゴを手描きで近似せず、デザインシステム §8 が既定とする
 * `@mui/icons-material`（Material Filled）の意味アイコンで代替する。
 */
const MUI_ICON_COMPONENTS: Readonly<Record<'vscodeExtension' | 'objectStorage', SvgIconComponent>> = {
  vscodeExtension: Extension,
  objectStorage: Storage,
};

/** ノードに付与できるアイコンの識別子。`architectureModel.ts` の `ArchNode.icon` が取る値。 */
export type ArchIconKey = keyof typeof BRAND_ICON_PATHS | keyof typeof MUI_ICON_COMPONENTS;

/** アイコン識別子の全集合。テストが `ArchNode.icon` の解決可能性を検査するために使う。 */
export const ARCH_ICON_KEYS: readonly ArchIconKey[] = [
  ...(Object.keys(BRAND_ICON_PATHS) as (keyof typeof BRAND_ICON_PATHS)[]),
  ...(Object.keys(MUI_ICON_COMPONENTS) as (keyof typeof MUI_ICON_COMPONENTS)[]),
];

function isBrandKey(key: ArchIconKey): key is keyof typeof BRAND_ICON_PATHS {
  return key in BRAND_ICON_PATHS;
}

/**
 * ノードラベルの前に置く装飾アイコン。
 *
 * Why not: `aria-label` を付けない。ノード名は隣接するテキストとして DOM にあり、
 * アイコンは同じ情報の重複表現でしかない。読み上げの二重化を避けて装飾に倒す
 * （要件書 R4「矢印コネクタは装飾として `aria-hidden`」と同じ扱い）。
 */
export function ArchitectureIcon({ icon }: Readonly<{ icon: ArchIconKey }>): ReactElement {
  if (!isBrandKey(icon)) {
    const MuiIcon = MUI_ICON_COMPONENTS[icon];
    return (
      <MuiIcon aria-hidden sx={{ fontSize: ICON_SIZE, flexShrink: 0 }} />
    );
  }

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      width={ICON_SIZE}
      height={ICON_SIZE}
      fill="currentColor"
      style={{ flexShrink: 0 }}
    >
      <path d={BRAND_ICON_PATHS[icon]} />
    </svg>
  );
}
