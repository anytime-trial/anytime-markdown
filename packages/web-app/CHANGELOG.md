# Changelog

All notable changes to `@anytime-markdown/web-app` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- ランディングページのモバイル対応
- docs カテゴリ編集ページの URL リンク対応
- CodeQL (SAST) と SonarCloud を daily-build に追加

### Changed
- aria-label の英語固定を i18n 対応（LandingHeader、SiteFooter、layout.tsx 等）
- global-error.tsx のダークモード対応（prefers-color-scheme）
- useLayoutEditor の useEffect にキャンセル処理を追加
- package.json の依存バージョンを exact 固定に変更

### Fixed
- Netlify CDN キャッシュにより API レスポンスが同一データを返す問題を修正
- docs スクロール位置の不具合を修正

### Security
- SEO メタタグのキーワード拡充・最適化

## [0.3.0] - 2026-03-10

### Added
- SEO 改善: OG 画像動的生成、Twitter Card、JSON-LD 構造化データ、各ページ個別 meta
- ヘルプページのスクリーンショット更新・v0.3.0 機能ドキュメント追加
