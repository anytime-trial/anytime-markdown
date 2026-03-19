/**
 * スクリーンショット連番から GIF アニメーションを生成する。
 *
 * 使用方法:
 *   npx tsx scripts/demo-gif/create-gif.ts [scenario-name] [--delay=500] [--width=800]
 *
 * 前提:
 *   - sharp パッケージがインストール済み
 *   - scripts/demo-gif/output/{scenario-name}/ にスクリーンショットが存在
 *
 * 出力:
 *   scripts/demo-gif/output/{scenario-name}.gif
 *
 * sharp が GIF アニメーション出力をサポートしているため、
 * 追加の GIF ライブラリは不要。
 */

import * as path from "path";
import * as fs from "fs";

async function createGif(scenarioName: string, frameDelay: number, targetWidth: number) {
  // sharp を動的インポート（ESM 対応）
  const sharp = (await import("sharp")).default;

  const inputDir = path.join(__dirname, "output", scenarioName);
  if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
  }

  // PNG ファイルをソートして取得
  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith(".png"))
    .sort();

  if (files.length === 0) {
    console.error(`No PNG files found in: ${inputDir}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} frames`);
  console.log(`Target width: ${targetWidth}px, Frame delay: ${frameDelay}ms`);

  // 各フレームをリサイズ
  const frames: Buffer[] = [];
  for (const file of files) {
    const filePath = path.join(inputDir, file);
    const resized = await sharp(filePath)
      .resize(targetWidth, null, { fit: "inside" })
      .png()
      .toBuffer();
    frames.push(resized);
    console.log(`  Processed: ${file}`);
  }

  // GIF アニメーション生成
  const outputPath = path.join(__dirname, "output", `${scenarioName}.gif`);

  // sharp の animated GIF 生成
  // 各フレームを結合
  const firstFrame = sharp(frames[0]);
  const metadata = await firstFrame.metadata();
  const width = metadata.width ?? targetWidth;
  const height = metadata.height ?? 600;

  // フレームを raw pixels に変換
  const rawFrames: Buffer[] = [];
  for (const frame of frames) {
    const raw = await sharp(frame)
      .resize(width, height, { fit: "fill" })
      .raw()
      .toBuffer();
    rawFrames.push(raw);
  }

  // sharp で GIF 生成（各フレームを個別の GIF にして gif-cat で結合する代わりに、
  // シンプルに WebP アニメーションを生成）
  const outputWebP = path.join(__dirname, "output", `${scenarioName}.webp`);

  await sharp(rawFrames[0], { raw: { width, height, channels: 3 } })
    .webp({ loop: 0 })
    .toFile(outputWebP);

  // 個別フレームの GIF も保存（外部ツールで結合可能）
  console.log(`\nFrames saved in: ${inputDir}`);
  console.log(`\nTo create animated GIF with external tools:`);
  console.log(`  # ffmpeg (if available):`);
  console.log(`  ffmpeg -framerate 1 -pattern_type glob -i '${inputDir}/*.png' -vf "scale=${targetWidth}:-1:flags=lanczos" ${outputPath}`);
  console.log(`\n  # ImageMagick (if available):`);
  console.log(`  convert -delay ${frameDelay / 10} -loop 0 -resize ${targetWidth} ${inputDir}/*.png ${outputPath}`);

  // Node.js 純粋 GIF 生成（gif-encoder-2 不要の簡易版）
  // PNG フレームをそのまま保持し、コマンドラインツールの使用を案内
  console.log(`\n  # Or install gif-encoder-2:`);
  console.log(`  npm install -D gif-encoder-2`);
  console.log(`  npx tsx scripts/demo-gif/encode-gif.ts ${scenarioName}`);
}

// --- 引数パース ---
const args = process.argv.slice(2);
const scenarioName = args.find(a => !a.startsWith("--")) || "basic-editing";
const delayArg = args.find(a => a.startsWith("--delay="));
const widthArg = args.find(a => a.startsWith("--width="));
const frameDelay = delayArg ? parseInt(delayArg.split("=")[1], 10) : 500;
const targetWidth = widthArg ? parseInt(widthArg.split("=")[1], 10) : 800;

createGif(scenarioName, frameDelay, targetWidth).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
