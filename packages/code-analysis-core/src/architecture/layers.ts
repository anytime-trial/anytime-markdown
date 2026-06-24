import { detectFrameworks } from './frameworks';
import type {
  ArchitectureLayer,
  FileMarker,
  FrameworkDetection,
  FrameworkId,
  ModuleClassification,
  ModuleManifest,
} from './types';

const CONFIDENCE_STRONG = 0.9;
const CONFIDENCE_NAME = 0.6;
const CONFIDENCE_FALLBACK = 0.3;

/** 永続化層として扱う *-core パッケージ（名前ベースの補強）。 */
const DATA_CORE_NAMES: ReadonlySet<string> = new Set([
  'doc-core',
  'memory-core',
  'database-core',
  'trail-core',
  'cms-core',
]);

/** ドメイン/AI サービス層のモジュール名（名前ベースの補強）。 */
const DOMAIN_NAMES: ReadonlySet<string> = new Set([
  'agent-core',
  'review-agent',
  'llm-core',
  'ollama-core',
  'markdown-engine',
  'markdown-eval-core',
]);

/** これらだけを使うモジュールは描画プリミティブ＝foundation 層。 */
const RENDER_ONLY: ReadonlySet<FrameworkId> = new Set<FrameworkId>([
  'markdown-render',
  'prosemirror',
  'charting',
]);

interface ClassifyContext {
  readonly short: string;
  readonly markers: readonly FileMarker[];
  readonly frameworks: readonly FrameworkDetection[];
  readonly has: (id: FrameworkId) => boolean;
}

interface RuleHit {
  readonly strong: boolean;
  readonly evidence: string;
}

interface LayerRule {
  readonly layer: ArchitectureLayer;
  readonly evaluate: (ctx: ClassifyContext) => RuleHit | null;
}

function evaluateExtension(c: ClassifyContext): RuleHit | null {
  if (c.has('vscode-extension')) {
    return { strong: true, evidence: 'engines.vscode / @types/vscode' };
  }
  return null;
}

function evaluateServer(c: ClassifyContext): RuleHit | null {
  if (c.short.endsWith('-server')) {
    return { strong: false, evidence: 'name *-server' };
  }
  return null;
}

function evaluateIntegration(c: ClassifyContext): RuleHit | null {
  if (c.has('mcp-sdk')) {
    return { strong: true, evidence: '@modelcontextprotocol/sdk dependency' };
  }
  if (c.short.startsWith('mcp-')) {
    return { strong: false, evidence: 'name mcp-*' };
  }
  return null;
}

function evaluateUi(c: ClassifyContext): RuleHit | null {
  const nameHit =
    c.short.endsWith('-viewer') ||
    c.short === 'web-app' ||
    c.short.endsWith('-react-islands') ||
    c.short === 'mindmap-viewer' ||
    c.short === 'browser-extension';
  const markerHit = c.markers.includes('next.config') || c.markers.includes('astro.config');
  if (!nameHit && !markerHit) return null;
  if (markerHit) {
    return { strong: true, evidence: 'next.config/astro.config marker' };
  }
  return { strong: false, evidence: 'viewer/app name' };
}

function evaluateAnalysis(c: ClassifyContext): RuleHit | null {
  if (c.has('ts-compiler')) {
    return { strong: true, evidence: 'TS Compiler API import' };
  }
  if (c.has('tree-sitter')) {
    return { strong: true, evidence: 'tree-sitter dependency' };
  }
  if (c.short.startsWith('code-analysis')) {
    return { strong: false, evidence: 'name code-analysis*' };
  }
  return null;
}

function evaluateData(c: ClassifyContext): RuleHit | null {
  if (c.has('sqlite')) {
    return { strong: true, evidence: 'SQLite driver' };
  }
  if (c.markers.includes('sqlite-schema')) {
    return { strong: true, evidence: 'sqlite-schema marker' };
  }
  if (c.short.endsWith('-db') || DATA_CORE_NAMES.has(c.short)) {
    return { strong: false, evidence: 'data module name' };
  }
  return null;
}

function evaluateServiceDomain(c: ClassifyContext): RuleHit | null {
  if (c.has('ollama')) {
    return { strong: true, evidence: 'ollama dependency' };
  }
  if (DOMAIN_NAMES.has(c.short)) {
    return { strong: false, evidence: 'domain/AI module name' };
  }
  return null;
}

function evaluateFoundation(c: ClassifyContext): RuleHit | null {
  if (c.short.endsWith('-core')) {
    return { strong: false, evidence: 'shared *-core library' };
  }
  const renderOnly = c.frameworks.length > 0 && c.frameworks.every((f) => RENDER_ONLY.has(f.id));
  if (renderOnly) {
    return { strong: false, evidence: 'render-only frameworks' };
  }
  return null;
}

/** 評価順（first-match wins）。順序が層の優先度を決める。 */
const RULES: readonly LayerRule[] = [
  { layer: 'presentation-extension', evaluate: evaluateExtension },
  { layer: 'service-server', evaluate: evaluateServer },
  { layer: 'integration', evaluate: evaluateIntegration },
  { layer: 'presentation-ui', evaluate: evaluateUi },
  { layer: 'analysis', evaluate: evaluateAnalysis },
  { layer: 'data', evaluate: evaluateData },
  { layer: 'service-domain', evaluate: evaluateServiceDomain },
  { layer: 'foundation', evaluate: evaluateFoundation },
];

function basename(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(i + 1) : name;
}

/**
 * モジュールをアーキテクチャ層に決定論で分類する。
 * 強シグナル（dependency/engine/marker）が裏付くと confidence が高く、
 * 命名規則のみの判定は中程度、無シグナルは utility（低 confidence）にフォールバックする。
 */
export function classifyLayer(manifest: ModuleManifest): ModuleClassification {
  const frameworks = detectFrameworks(manifest);
  const ids = new Set(frameworks.map((f) => f.id));
  const ctx: ClassifyContext = {
    short: basename(manifest.name),
    markers: manifest.markers ?? [],
    frameworks,
    has: (id) => ids.has(id),
  };

  for (const rule of RULES) {
    const hit = rule.evaluate(ctx);
    if (hit) {
      return {
        name: manifest.name,
        layer: rule.layer,
        confidence: hit.strong ? CONFIDENCE_STRONG : CONFIDENCE_NAME,
        evidence: [hit.evidence],
        frameworks,
      };
    }
  }

  return {
    name: manifest.name,
    layer: 'utility',
    confidence: CONFIDENCE_FALLBACK,
    evidence: ['no strong signal'],
    frameworks,
  };
}
