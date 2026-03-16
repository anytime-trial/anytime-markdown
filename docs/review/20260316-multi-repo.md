# レビュー: 複数リポジトリ対応

日付: 2026-03-16
スキル: code-reviewer agent
参照: docs/plan/20260316-multi-repo.md

## 変更ファイル

1. `packages/vscode-extension/src/providers/SpecDocsProvider.ts`
2. `packages/vscode-extension/src/extension.ts`
3. `packages/vscode-extension/package.json`
4. `packages/vscode-extension/package.nls.json`
5. `packages/vscode-extension/package.nls.ja.json`

## 検出・修正済み

- マイグレーション時に新キー(STORAGE_KEY_MULTI)への保存が欠落していたバグ → 修正済み
- `findRootForPath` のパス区切り文字未考慮(`/project` が `/project2` にマッチ) → 修正済み
- DragAndDrop 内の同様のパス比較 → 修正済み
- `git clone` のコマンドインジェクション(`exec` → `execFile`) → 修正済み

## 残存事項(低リスク)

- `specDocsTreeView.title = undefined as unknown as string` は元のコードから継続。VS Code API上 `undefined` で初期タイトルに戻るが型ハック
- `switchBranch` が `view/title` から呼ばれた場合、複数ルート時に `rootPaths[0]` が暗黙の操作対象になる
- `getRepoInfo` の `.git` ファイル(worktree/submodule)処理が不完全(元のコードから継続)

## ビルド検証

- `npx tsc --noEmit`: OK
- `npx webpack --mode production`: OK (警告のみ、エラーなし)
