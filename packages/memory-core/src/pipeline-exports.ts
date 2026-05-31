// typescript を引き込む pipeline / service / code-ingest 層の公開面。
//
// この subpath を import すると TypeScript Compiler API (~9MB) がバンドルに入る。
// コード解析を実行するホスト (vscode-trail-extension / trail-server) のみが import する。
// DB 読み取りだけが必要な thin client (mcp-trail 等) は root もしくは `./query` を使うこと。
//
// ここには値 (value) のみ置く。型は root の index.ts が `export type` で再公開しており
// (型は erase され runtime 汚染しないため)、型のみ必要な consumer は root のままでよい。

export { runCodeIncremental } from './pipeline/runCodeIncremental';
export { ingestDecisionComments } from './ingest/code/extractComments';
export { MemoryCoreService, defaultStatePath } from './service/MemoryCoreService';
export { MemoryDbSession } from './service/MemoryDbSession';
export { runMemoryCorePipeline } from './service/defaultMemoryCorePipelineRunner';
