// 後方互換シム。実体は @anytime-markdown/markdown-engine（フレームワーク非依存層）へ移管した。
// 既存の `./utils/diffEngine` import / `markdown-viewer/src/utils/diffEngine` deep import を維持するための再エクスポート。
export * from "@anytime-markdown/markdown-engine";
