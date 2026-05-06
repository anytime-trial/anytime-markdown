export const DEFAULT_ANALYZE_EXCLUDE_CONTENT = `# コードグラフ解析から除外するパターン（.gitignore 互換）
# 詳細: https://git-scm.com/docs/gitignore
# 例:
#   __tests__/        - 任意階層の __tests__ ディレクトリ配下
#   *.spec.ts         - 任意階層の *.spec.ts ファイル
#   /dist             - ルート直下の dist のみ
#   !path/foo.test.ts - 上記除外から除外（明示的に含める）
# Auto-generated on first analyze. Edit freely.

.worktrees/
.vscode-test/
__tests__/
fixtures/
`;
