export const DEFAULT_IGNORE_FILE_CONTENT = `# Auto-generated on first analyze. Edit freely.
# Patterns follow .gitignore syntax (! for negation).

# パッケージ index 再 export
**/index.ts
**/index.tsx
**/types.ts

# 設定ファイル・型宣言
**/*.config.ts
**/*.config.js
**/*.config.mjs
**/*.config.cjs
**/*.d.ts

# テスト
**/__tests__/**
**/*.test.ts
**/*.test.tsx
**/*.test.js
**/*.test.jsx
**/*.spec.ts
**/*.spec.tsx
**/*.spec.js
**/*.spec.jsx
**/jest.setup.*
**/jest.config.*

# CLI / ユーティリティ
**/bin/**
**/scripts/**

# VS Code 拡張 entry
**/extension.ts

# Next.js 規約ファイル
**/page.tsx
**/layout.tsx
**/route.ts
**/middleware.ts
**/loading.tsx
**/error.tsx
**/not-found.tsx

# MCP サーバー entry
**/server.ts
**/stdio.ts
`;
