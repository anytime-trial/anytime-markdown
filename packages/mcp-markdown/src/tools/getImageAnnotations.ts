import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildAnnotationKey,
  extractImageAnnotationBlock,
  type ImageAnnotation,
  matchesAnnotationSrcKey,
  parseAnnotationKey,
  parseAnnotations,
} from '@anytime-markdown/markdown-editor/internal/types/imageAnnotation';

import { type ImageSize, readImageSize } from '../utils/imageSize';
import { type BodyImage, listBodyImages } from '../utils/markdownImages';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

/** 画像本体を返すときの上限（要件 NFR-02） */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_CALL = 5;

/** サイズ読み取りのために読む先頭バイト数（JPEG の SOF が遅い位置にあっても届く大きさ） */
const SIZE_PROBE_BYTES = 512 * 1024;
/** 応答に載せる src の最大長（data URI の本体を載せない） */
const MAX_SRC_CHARS = 100;

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
/** image content として返してよい MIME（ファイル・data URI 共通の許可リスト） */
const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));

export interface GetImageAnnotationsInput {
  path: string;
  includeResolved?: boolean;
  includeImages?: boolean;
  imageIndex?: number;
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AnnotationView {
  id: string;
  type: ImageAnnotation['type'];
  percent: Rect;
  pixels?: Rect;
  color: string;
  comment?: string;
  resolved: boolean;
}

export interface ImageEntry {
  index: number;
  src: string;
  alt: string;
  line: number;
  heading?: string;
  size?: ImageSize;
  sizeUnavailableReason?: string;
  annotations: AnnotationView[];
}

export interface ImageAnnotationsResult {
  path: string;
  images: ImageEntry[];
  unmatched: Array<{ key: string; reason: string; annotations: AnnotationView[] }>;
  skipped: Array<{ key?: string; line?: string; reason: string }>;
  imageData: Array<{ index: number; mimeType: string; data: string }>;
  imageErrors: Array<{ index: number; reason: string }>;
}

function toView(a: ImageAnnotation, size: ImageSize | undefined): AnnotationView {
  const percent = { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
  const view: AnnotationView = { id: a.id, type: a.type, percent, color: a.color, resolved: a.resolved === true };
  if (a.comment !== undefined) view.comment = a.comment;
  if (size) {
    const px = (pct: number, total: number) => Math.round((pct / 100) * total);
    view.pixels = {
      x1: px(a.x1, size.width), y1: px(a.y1, size.height),
      x2: px(a.x2, size.width), y2: px(a.y2, size.height),
    };
  }
  return view;
}

function truncateSrc(src: string): string {
  return src.length > MAX_SRC_CHARS ? `${src.slice(0, MAX_SRC_CHARS)}…` : src;
}

/**
 * 応答に載せる失敗理由。Node のエラーコード（ENOENT 等）だけを返す。
 * Why not: error.message をそのまま返さない。realpath 等のメッセージにはワークスペースの絶対パスが入る。
 */
function errorReason(error: unknown): string {
  // instanceof Error は使わない（jest の VM など別レルムで生成された fs のエラーを取りこぼす）
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code;
  return error instanceof Error ? error.message : String(error);
}

interface Roots {
  /** 呼び出し元が渡した rootDir（字面の判定用） */
  lexical: string;
  /** rootDir の realpath（シンボリックリンク解決後の判定用） */
  real: string;
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

const OUTSIDE_ROOT = 'Access denied: path outside root directory';

/**
 * ワークスペース内に収まるパスの realpath を返す。字面で外を指す指定は存在確認より先に拒否し、
 * realpath でも外へ出る（シンボリックリンク経由の）指定を拒否する。
 */
async function resolveInsideRoot(roots: Roots, target: string): Promise<string> {
  if (!isInside(roots.lexical, target) && !isInside(roots.real, target)) throw new Error(OUTSIDE_ROOT);
  const real = await fs.realpath(target);
  if (!isInside(roots.real, real)) throw new Error(OUTSIDE_ROOT);
  return real;
}

/**
 * ワークスペース内に解決したファイルを開く。末端をシンボリックリンクへ差し替えられた場合は O_NOFOLLOW で失敗させ、
 * 検証と読み取りの間の差し替え（TOCTOU）で外のファイルを読まないようにする。
 */
async function openInsideRoot(roots: Roots, target: string): Promise<fs.FileHandle> {
  const real = await resolveInsideRoot(roots, target);
  return fs.open(real, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
}

async function readHead(handle: fs.FileHandle, bytes: number): Promise<Buffer> {
  const buf = Buffer.alloc(bytes);
  const { bytesRead } = await handle.read(buf, 0, bytes, 0);
  return buf.subarray(0, bytesRead);
}

type ImageSource =
  | { kind: 'data'; mimeType: string; bytes: Buffer }
  | { kind: 'file'; absPath: string; mimeType?: string }
  | { kind: 'rejected'; reason: string };

function classifySrc(src: string, mdDir: string): ImageSource {
  if (src.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(src);
    if (!match) return { kind: 'rejected', reason: 'unsupported data URI (base64 only)' };
    return { kind: 'data', mimeType: match[1].toLowerCase(), bytes: Buffer.from(match[2], 'base64') };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('\\\\')) {
    return { kind: 'rejected', reason: 'external URL is not fetched' };
  }
  let decoded: string;
  try {
    decoded = decodeURI(src.split(/[?#]/)[0]);
  } catch {
    return { kind: 'rejected', reason: 'invalid percent-encoding in src' };
  }
  const absPath = path.resolve(mdDir, decoded);
  return { kind: 'file', absPath, mimeType: MIME_BY_EXT[path.extname(absPath).toLowerCase()] };
}

async function probeSize(source: ImageSource, roots: Roots): Promise<{ size?: ImageSize; reason?: string }> {
  if (source.kind === 'rejected') return { reason: source.reason };
  try {
    let head: Buffer;
    if (source.kind === 'data') {
      head = source.bytes;
    } else {
      const handle = await openInsideRoot(roots, source.absPath);
      try {
        head = await readHead(handle, SIZE_PROBE_BYTES);
      } finally {
        await handle.close();
      }
    }
    const size = readImageSize(head);
    return size ? { size } : { reason: 'image format not supported for size detection' };
  } catch (error) {
    return { reason: errorReason(error) };
  }
}

async function loadImageData(
  source: ImageSource,
  roots: Roots,
): Promise<{ mimeType: string; data: string } | { reason: string }> {
  if (source.kind === 'rejected') return { reason: source.reason };
  if (!source.mimeType || !ALLOWED_MIME.has(source.mimeType)) {
    return { reason: `unsupported image type: ${source.mimeType ?? 'unknown'}` };
  }
  if (source.kind === 'data') {
    if (source.bytes.length > MAX_IMAGE_BYTES) return { reason: 'image exceeds 5 MB limit' };
    return { mimeType: source.mimeType, data: source.bytes.toString('base64') };
  }
  try {
    const handle = await openInsideRoot(roots, source.absPath);
    try {
      if ((await handle.stat()).size > MAX_IMAGE_BYTES) return { reason: 'image exceeds 5 MB limit' };
      // stat 後に肥大化しても上限 + 1 バイトまでしか読まず、超過を検出する
      const bytes = await readHead(handle, MAX_IMAGE_BYTES + 1);
      if (bytes.length > MAX_IMAGE_BYTES) return { reason: 'image exceeds 5 MB limit' };
      return { mimeType: source.mimeType, data: bytes.toString('base64') };
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { reason: errorReason(error) };
  }
}

interface ParsedLine {
  key: string;
  index: number;
  srcKey: string;
  annotations: ImageAnnotation[];
}

/**
 * 注記ブロックの 1 行を解析する。必須項目の欠けた注記は除き、除いた件数を理由として返す
 * （読めた注記は捨てない）。
 */
function parseBlockLine(key: string, data: string): { parsed?: ParsedLine; reason?: string } {
  const parsedKey = parseAnnotationKey(key);
  if (!parsedKey) return { reason: 'invalid key (expected img<index>:<src>)' };
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return { reason: 'annotation data is not valid JSON' };
  }
  if (!Array.isArray(raw)) return { reason: 'annotation data is not a JSON array' };
  const annotations = parseAnnotations(data);
  const dropped = raw.length - annotations.length;
  return {
    parsed: annotations.length > 0 ? { key, ...parsedKey, annotations } : undefined,
    reason: dropped > 0 ? `${dropped} annotation(s) missing required fields` : undefined,
  };
}

function parseBlockLines(
  lines: ReadonlyArray<{ key: string; data: string }>,
  skipped: ImageAnnotationsResult['skipped'],
): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  for (const { key, data } of lines) {
    const line = parseBlockLine(key, data);
    if (line.reason) skipped.push({ key, reason: line.reason });
    if (line.parsed) parsed.push(line.parsed);
  }
  return parsed;
}

/** 注記キーを本文の画像へ対応づける。対応しなければ unmatched の理由を返す */
function matchImage(entry: ParsedLine, bodyImages: readonly BodyImage[]): BodyImage | { reason: string } {
  const image = bodyImages[entry.index];
  if (!image) return { reason: `no image at index ${entry.index}` };
  if (!matchesAnnotationSrcKey(image.src, entry.srcKey)) {
    return { reason: `src mismatch: image #${entry.index} is ${truncateSrc(buildAnnotationKey(entry.index, image.src))}` };
  }
  return image;
}

async function attachImageData(
  result: ImageAnnotationsResult,
  index: number,
  source: ImageSource,
  roots: Roots,
): Promise<void> {
  if (result.imageData.length >= MAX_IMAGES_PER_CALL) {
    result.imageErrors.push({ index, reason: `per-call image limit (${MAX_IMAGES_PER_CALL}) reached` });
    return;
  }
  const loaded = await loadImageData(source, roots);
  if ('reason' in loaded) result.imageErrors.push({ index, reason: loaded.reason });
  else result.imageData.push({ index, ...loaded });
}

async function readMarkdown(rootDir: string, userPath: string): Promise<{ roots: Roots; mdPath: string; text: string }> {
  const resolved = resolveSecurePath(rootDir, userPath);
  validateFileExtension(resolved, ALLOWED_EXTENSIONS);
  const roots: Roots = { lexical: path.resolve(rootDir), real: await fs.realpath(rootDir) };
  const handle = await openInsideRoot(roots, resolved);
  try {
    return { roots, mdPath: await fs.realpath(resolved), text: await handle.readFile('utf-8') };
  } finally {
    await handle.close();
  }
}

/**
 * Markdown に保存された画像アノテーションを画像単位に構造化して返す（読み取り専用）。
 * 要件: spec/35.mcp/05.image-annotation-reader/image-annotation-reader-requirements.ja.md
 */
export async function getImageAnnotations(
  input: GetImageAnnotationsInput,
  rootDir: string,
): Promise<ImageAnnotationsResult> {
  const { roots, mdPath, text } = await readMarkdown(rootDir, input.path);
  const { lines, malformed, body } = extractImageAnnotationBlock(text);
  const result: ImageAnnotationsResult = {
    path: input.path, images: [], unmatched: [], skipped: [], imageData: [], imageErrors: [],
  };
  for (const line of malformed) result.skipped.push({ line, reason: 'line has no "=" separator' });

  const bodyImages = listBodyImages(body);
  const keep = (a: ImageAnnotation) => input.includeResolved === true || a.resolved !== true;
  const entries = parseBlockLines(lines, result.skipped)
    .filter((e) => input.imageIndex === undefined || e.index === input.imageIndex)
    .map((e) => ({ ...e, annotations: e.annotations.filter(keep) }))
    .filter((e) => e.annotations.length > 0);

  for (const entry of entries) {
    const matched = matchImage(entry, bodyImages);
    if ('reason' in matched) {
      result.unmatched.push({ key: entry.key, reason: matched.reason, annotations: entry.annotations.map((a) => toView(a, undefined)) });
      continue;
    }
    const source = classifySrc(matched.src, path.dirname(mdPath));
    const { size, reason } = await probeSize(source, roots);
    const view: ImageEntry = { ...matched, src: truncateSrc(matched.src), annotations: entry.annotations.map((a) => toView(a, size)) };
    if (size) view.size = size;
    else view.sizeUnavailableReason = reason;
    result.images.push(view);
    if (input.includeImages === true) await attachImageData(result, matched.index, source, roots);
  }
  return result;
}
