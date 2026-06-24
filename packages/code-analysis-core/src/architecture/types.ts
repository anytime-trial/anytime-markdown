/**
 * アーキテクチャ層。モジュール（パッケージ）単位の分類結果。
 * Understand Anything の architecture-analyzer 相当を決定論で再現する。
 */
export type ArchitectureLayer =
  | 'foundation'
  | 'analysis'
  | 'data'
  | 'service-domain'
  | 'service-server'
  | 'integration'
  | 'presentation-ui'
  | 'presentation-extension'
  | 'utility';

/** 検出対象フレームワーク（ビルドツールは含めない＝意味のあるランタイム/解析依存のみ）。 */
export type FrameworkId =
  | 'react'
  | 'vue'
  | 'nextjs'
  | 'astro'
  | 'vite'
  | 'mcp-sdk'
  | 'sqlite'
  | 'tree-sitter'
  | 'ts-compiler'
  | 'ollama'
  | 'supabase'
  | 'aws-s3'
  | 'zod'
  | 'prosemirror'
  | 'sigma'
  | 'markdown-render'
  | 'express'
  | 'fastify'
  | 'hono'
  | 'mui'
  | 'charting'
  | 'vscode-extension';

/**
 * フレームワーク検出の根拠ソース。重み（runtime/engine/marker > peer > dev）で
 * confidence と重複時の採用を決める。dependency-only 検出の取りこぼし（devDep 偏在）を
 * marker で補強するための区別。
 */
export type DependencySource = 'runtime' | 'peer' | 'dev' | 'engine' | 'marker';

/**
 * ソースコード/設定ファイルから収集する補強マーカー。FS 走査は呼び出し側の責務。
 * - ts-compiler-import: `import ts from 'typescript'` 等、typescript を runtime 利用（devDep でも解析層）
 * - sqlite-schema: スキーマ DDL/migration を所有（永続化層）
 * - next.config / vite.config / astro.config: フロントエンドビルド構成
 * - wasm: tree-sitter 等 WASM 依存
 */
export type FileMarker =
  | 'next.config'
  | 'vite.config'
  | 'astro.config'
  | 'wasm'
  | 'sqlite-schema'
  | 'ts-compiler-import';

/** 分類器の入力。package.json の中身＋マーカーを呼び出し側が構築して渡す（core は FS を読まない）。 */
export interface ModuleManifest {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly markers?: readonly FileMarker[];
}

export interface FrameworkDetection {
  readonly id: FrameworkId;
  readonly source: DependencySource;
}

export interface ModuleClassification {
  readonly name: string;
  readonly layer: ArchitectureLayer;
  /** 0..1。dependency/engine/marker で裏付くと高く、命名規則のみだと中程度。 */
  readonly confidence: number;
  /** 判定根拠（dep / engine / marker / 命名）。 */
  readonly evidence: readonly string[];
  readonly frameworks: readonly FrameworkDetection[];
}
