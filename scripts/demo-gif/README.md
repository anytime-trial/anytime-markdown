# Demo GIF 作成ツール

Playwright + Electron で VS Code を操作し、スクリーンショット連番からアニメーション GIF を作成する。

## 前提条件

- VS Code がローカルにインストール済み
- 拡張機能がビルド済み（`npm run package`）
- Playwright インストール済み

## 手順

### 1. スクリーンショット撮影

```bash
# VS Code のパスを指定（Linux）
VSCODE_PATH=/usr/bin/code npx tsx scripts/demo-gif/capture.ts basic-editing

# Mac
VSCODE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Electron" npx tsx scripts/demo-gif/capture.ts basic-editing

# Windows
VSCODE_PATH="C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe" npx tsx scripts/demo-gif/capture.ts basic-editing
```

### 2. GIF 生成

```bash
# ffmpeg が使える場合（推奨）
ffmpeg -framerate 1 -pattern_type glob -i 'scripts/demo-gif/output/basic-editing/*.png' \
  -vf "scale=800:-1:flags=lanczos" scripts/demo-gif/output/basic-editing.gif

# gif-encoder-2 を使う場合
npm install -D gif-encoder-2 canvas
npx tsx scripts/demo-gif/encode-gif.ts basic-editing --delay=1000 --width=800
```

### 3. シナリオの追加

`capture.ts` の `scenarios` オブジェクトにシナリオを追加する。

```typescript
scenarios["my-demo"] = [
  {
    label: "Step 1",
    action: async (page) => {
      await page.keyboard.press("Control+Shift+p");
      await page.keyboard.type("Open File");
    },
    delay: 2000,
  },
];
```

## 出力

```
scripts/demo-gif/output/
  basic-editing/
    000-initial.png
    001-Open_markdown_file.png
    002-Type_heading.png
  basic-editing.gif
```
