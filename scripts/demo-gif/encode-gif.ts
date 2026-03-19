/**
 * PNG 連番から GIF アニメーションを生成する（gif-encoder-2 使用）。
 *
 * 前提: npm install -D gif-encoder-2
 * 使用: npx tsx scripts/demo-gif/encode-gif.ts [scenario-name] [--delay=1000] [--width=800]
 */

import * as path from "path";
import * as fs from "fs";
import { createCanvas, loadImage } from "canvas";

async function encodeGif(scenarioName: string, frameDelay: number, targetWidth: number) {
  const GIFEncoder = (await import("gif-encoder-2")).default;

  const inputDir = path.join(__dirname, "output", scenarioName);
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith(".png")).sort();

  if (files.length === 0) {
    console.error(`No PNG files in: ${inputDir}`);
    process.exit(1);
  }

  // 最初のフレームからサイズを取得
  const firstImg = await loadImage(path.join(inputDir, files[0]));
  const scale = targetWidth / firstImg.width;
  const width = targetWidth;
  const height = Math.round(firstImg.height * scale);

  console.log(`Creating GIF: ${width}x${height}, ${files.length} frames, ${frameDelay}ms delay`);

  const encoder = new GIFEncoder(width, height);
  const outputPath = path.join(__dirname, "output", `${scenarioName}.gif`);
  const stream = fs.createWriteStream(outputPath);

  encoder.createReadStream().pipe(stream);
  encoder.start();
  encoder.setRepeat(0);   // 0 = ループ
  encoder.setDelay(frameDelay);
  encoder.setQuality(10);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  for (const file of files) {
    const img = await loadImage(path.join(inputDir, file));
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);
    console.log(`  Added: ${file}`);
  }

  encoder.finish();

  await new Promise<void>((resolve) => stream.on("finish", resolve));
  const size = fs.statSync(outputPath).size;
  console.log(`\nGIF saved: ${outputPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

const args = process.argv.slice(2);
const scenarioName = args.find(a => !a.startsWith("--")) || "basic-editing";
const delayArg = args.find(a => a.startsWith("--delay="));
const widthArg = args.find(a => a.startsWith("--width="));
const frameDelay = delayArg ? parseInt(delayArg.split("=")[1], 10) : 1000;
const targetWidth = widthArg ? parseInt(widthArg.split("=")[1], 10) : 800;

encodeGif(scenarioName, frameDelay, targetWidth).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
