/**
 * anytime-markdown ワークスペースの論理構成（システム構成図）の静的定義。
 *
 * 要件: spec/10.web-app/system-architecture-page/system-architecture-page.ja.md
 *
 * Why not: Trail の `/api/c4/model` から動的取得しない。あちらは Supabase 経由のため
 * 外部サービスの可用性に画面の成否が従属する。構成の更新頻度（パッケージ新設は月に数件）
 * に対し、静的定義の手動更新コストのほうが安い。
 *
 * `pkg` はリポジトリの `packages/<pkg>` に実在するディレクトリ名。
 * `architectureModel.test.ts` が実在を機械検査するため、改名・削除は必ずここへ反映する。
 */

/** レイヤ識別子。表示順はこの配列（ARCHITECTURE_LAYERS）の順序が単一の正。 */
export type LayerId = 'client' | 'mcp' | 'core' | 'storage' | 'external';

/** 構成図の 1 ノード。ノード名は実装名をそのまま出すため i18n しない。 */
export interface ArchNode {
  /** ノード識別子（モデル全体で一意） */
  readonly id: string;
  /** 表示ラベル。VS Code 拡張は publisher 上の拡張名、それ以外はパッケージ名 */
  readonly label: string;
  /** `packages/<pkg>` のディレクトリ名。リポジトリ外の要素（DB・外部サービス）は持たない */
  readonly pkg?: string;
  /** 差し色（アンバー）で強調するノード。デザインシステム §1 に従い図中で 1 つだけ */
  readonly accent?: boolean;
}

/** レイヤ内の意味的なまとまり。ラベルは i18n キー（`Architecture.groups.<key>`）。 */
export interface ArchGroup {
  readonly id: string;
  readonly labelKey: string;
  readonly nodes: readonly ArchNode[];
}

/**
 * 1 レイヤ。`flowKey` は「このレイヤから次のレイヤへ何が流れるか」の説明
 * （i18n キー `Architecture.flows.<key>`）。最下段レイヤは持たない。
 */
export interface ArchLayer {
  readonly id: LayerId;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly flowKey?: string;
  readonly groups: readonly ArchGroup[];
}

export const ARCHITECTURE_LAYERS: readonly ArchLayer[] = [
  {
    id: 'client',
    labelKey: 'client',
    descriptionKey: 'client',
    flowKey: 'clientToMcp',
    groups: [
      {
        id: 'client-vscode',
        labelKey: 'vscodeExtensions',
        nodes: [
          { id: 'ext-markdown', label: 'Anytime Markdown', pkg: 'vscode-markdown-extension' },
          { id: 'ext-graph', label: 'Anytime Graph', pkg: 'vscode-graph-extension' },
          { id: 'ext-trail', label: 'Anytime Trail', pkg: 'vscode-trail-extension' },
          { id: 'ext-agent', label: 'Anytime Agent', pkg: 'vscode-agent-extension' },
          { id: 'ext-database', label: 'Anytime Database', pkg: 'vscode-database-extension' },
          { id: 'ext-history', label: 'Anytime History', pkg: 'vscode-history-extension' },
          { id: 'ext-sheet', label: 'Anytime Sheet', pkg: 'vscode-sheet-extension' },
          { id: 'ext-pack', label: 'Extension Pack', pkg: 'vscode-extension-pack' },
        ],
      },
      {
        id: 'client-web',
        labelKey: 'web',
        nodes: [{ id: 'web-app', label: 'web-app', pkg: 'web-app', accent: true }],
      },
      {
        id: 'client-browser',
        labelKey: 'browser',
        nodes: [{ id: 'browser-extension', label: 'browser-extension', pkg: 'browser-extension' }],
      },
    ],
  },
  {
    id: 'mcp',
    labelKey: 'mcp',
    descriptionKey: 'mcp',
    flowKey: 'mcpToCore',
    groups: [
      {
        id: 'mcp-servers',
        labelKey: 'mcpServers',
        nodes: [
          { id: 'mcp-markdown', label: 'mcp-markdown', pkg: 'mcp-markdown' },
          { id: 'mcp-graph', label: 'mcp-graph', pkg: 'mcp-graph' },
          { id: 'mcp-trail', label: 'mcp-trail', pkg: 'mcp-trail' },
          { id: 'mcp-cms', label: 'mcp-cms', pkg: 'mcp-cms' },
          { id: 'mcp-cms-remote', label: 'mcp-cms-remote', pkg: 'mcp-cms-remote' },
        ],
      },
    ],
  },
  {
    id: 'core',
    labelKey: 'core',
    descriptionKey: 'core',
    flowKey: 'coreToStorage',
    groups: [
      {
        id: 'core-editing',
        labelKey: 'editing',
        nodes: [
          { id: 'markdown-editor', label: 'markdown-editor', pkg: 'markdown-editor' },
          { id: 'markdown-rich-editor', label: 'markdown-rich-editor', pkg: 'markdown-rich-editor' },
          { id: 'markdown-core', label: 'markdown-core', pkg: 'markdown-core' },
          { id: 'markdown-engine', label: 'markdown-engine', pkg: 'markdown-engine' },
          { id: 'markdown-view', label: 'markdown-view', pkg: 'markdown-view' },
          { id: 'markdown-view-lite', label: 'markdown-view-lite', pkg: 'markdown-view-lite' },
          { id: 'markdown-react-islands', label: 'markdown-react-islands', pkg: 'markdown-react-islands' },
          { id: 'markdown-catalog', label: 'markdown-catalog', pkg: 'markdown-catalog' },
          { id: 'markdown-eval-core', label: 'markdown-eval-core', pkg: 'markdown-eval-core' },
          { id: 'section-lock-core', label: 'section-lock-core', pkg: 'section-lock-core' },
        ],
      },
      {
        id: 'core-visualization',
        labelKey: 'visualization',
        nodes: [
          { id: 'graph-core', label: 'graph-core', pkg: 'graph-core' },
          { id: 'graph-viewer', label: 'graph-viewer', pkg: 'graph-viewer' },
          { id: 'graph-react-islands', label: 'graph-react-islands', pkg: 'graph-react-islands' },
          { id: 'cooccurrence-viewer', label: 'cooccurrence-viewer', pkg: 'cooccurrence-viewer' },
          { id: 'chart-core', label: 'chart-core', pkg: 'chart-core' },
          { id: 'trace-core', label: 'trace-core', pkg: 'trace-core' },
          { id: 'trace-viewer', label: 'trace-viewer', pkg: 'trace-viewer' },
          { id: 'trace-agent-node', label: 'trace-agent-node', pkg: 'trace-agent-node' },
        ],
      },
      {
        id: 'core-tabular',
        labelKey: 'tabular',
        nodes: [
          { id: 'spreadsheet-core', label: 'spreadsheet-core', pkg: 'spreadsheet-core' },
          { id: 'spreadsheet-viewer', label: 'spreadsheet-viewer', pkg: 'spreadsheet-viewer' },
          { id: 'database-core', label: 'database-core', pkg: 'database-core' },
          { id: 'database-viewer', label: 'database-viewer', pkg: 'database-viewer' },
        ],
      },
      {
        id: 'core-trail',
        labelKey: 'trail',
        nodes: [
          { id: 'trail-activity', label: 'trail-activity', pkg: 'trail-activity' },
          { id: 'trail-caravan-book', label: 'trail-caravan-book', pkg: 'trail-caravan-book' },
          { id: 'trail-db', label: 'trail-db', pkg: 'trail-db' },
          { id: 'trail-server', label: 'trail-server', pkg: 'trail-server' },
          { id: 'trail-viewer', label: 'trail-viewer', pkg: 'trail-viewer' },
        ],
      },
      {
        id: 'core-agent',
        labelKey: 'agent',
        nodes: [
          { id: 'agent-core', label: 'agent-core', pkg: 'agent-core' },
          { id: 'review-agent', label: 'review-agent', pkg: 'review-agent' },
          { id: 'llm-core', label: 'llm-core', pkg: 'llm-core' },
          { id: 'ollama-core', label: 'ollama-core', pkg: 'ollama-core' },
        ],
      },
      {
        id: 'core-analysis',
        labelKey: 'analysis',
        nodes: [
          { id: 'code-analysis-core', label: 'code-analysis-core', pkg: 'code-analysis-core' },
          { id: 'code-analysis-typescript', label: 'code-analysis-typescript', pkg: 'code-analysis-typescript' },
          { id: 'code-analysis-python', label: 'code-analysis-python', pkg: 'code-analysis-python' },
        ],
      },
      {
        id: 'core-business',
        labelKey: 'business',
        nodes: [
          { id: 'tickets-core', label: 'tickets-core', pkg: 'tickets-core' },
          { id: 'tickets-viewer', label: 'tickets-viewer', pkg: 'tickets-viewer' },
          { id: 'cms-core', label: 'cms-core', pkg: 'cms-core' },
        ],
      },
      {
        id: 'core-foundation',
        labelKey: 'foundation',
        nodes: [
          { id: 'ui-core', label: 'ui-core', pkg: 'ui-core' },
          { id: 'vscode-common', label: 'vscode-common', pkg: 'vscode-common' },
        ],
      },
    ],
  },
  {
    id: 'storage',
    labelKey: 'storage',
    descriptionKey: 'storage',
    flowKey: 'storageToExternal',
    groups: [
      {
        id: 'storage-sqlite',
        labelKey: 'sqlite',
        nodes: [
          { id: 'db-activity', label: 'activity.db' },
          { id: 'db-caravan-book', label: 'caravan-book.db' },
          { id: 'db-catalog', label: 'catalog.db' },
        ],
      },
      {
        id: 'storage-files',
        labelKey: 'files',
        nodes: [
          { id: 'file-docs', label: 'docsRoot Markdown' },
          { id: 'file-tickets', label: '.tickets/*.md' },
          { id: 'file-lep', label: '.anytime/lep.json' },
        ],
      },
    ],
  },
  {
    id: 'external',
    labelKey: 'external',
    descriptionKey: 'external',
    groups: [
      {
        id: 'external-data',
        labelKey: 'dataPlatform',
        nodes: [
          { id: 'ext-s3', label: 'Amazon S3' },
          { id: 'ext-supabase', label: 'Supabase' },
          { id: 'ext-google-drive', label: 'Google Drive / Docs API' },
        ],
      },
      {
        id: 'external-ai',
        labelKey: 'aiRuntime',
        nodes: [
          { id: 'ext-ollama', label: 'Ollama' },
          { id: 'ext-agents', label: 'Claude Code / Codex CLI' },
        ],
      },
      {
        id: 'external-hosting',
        labelKey: 'hosting',
        nodes: [
          { id: 'ext-workers', label: 'Cloudflare Workers' },
          { id: 'ext-github', label: 'GitHub' },
        ],
      },
    ],
  },
];

/** 図に載るノードの総数。受け入れ基準 1（描画ノード数との一致）の期待値になる。 */
export function countArchitectureNodes(
  layers: readonly ArchLayer[] = ARCHITECTURE_LAYERS,
): number {
  return layers.reduce(
    (total, layer) => total + layer.groups.reduce((sum, group) => sum + group.nodes.length, 0),
    0,
  );
}

/** モデル中の全ノードを平坦化する。実在検査・一意性検査が使う。 */
export function flattenArchitectureNodes(
  layers: readonly ArchLayer[] = ARCHITECTURE_LAYERS,
): readonly ArchNode[] {
  return layers.flatMap((layer) => layer.groups.flatMap((group) => group.nodes));
}
