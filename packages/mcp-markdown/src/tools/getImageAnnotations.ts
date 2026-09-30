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
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { type ImageSize, readImageSize } from '../utils/imageSize';

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

interface BodyImage {
  index: number;
  src: string;
  alt: string;
  line: number;
  heading?: string;
}

const IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^#{1,6}\s+\S/;
const GIF_SETTINGS_PREFIX = '<!-- gif-settings:';

function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0] !== '---') return 0;
  const end = lines.indexOf('---', 1);
  return end === -1 ? 0 : end + 1;
}

/**
 * 本文の画像を、エディタが注記を保存するときと同じ順序で数える。
 * フェンス内・フロントマター内は数えず、gif-settings の付いた GIF（保存時は gifBlock で数えない）も除く。
 */
export function listBodyImages(markdown: string): BodyImage[] {
  const lines = markdown.split('\n');
  const images: BodyImage[] = [];
  let inFence = false;
  let heading: string | undefined;

  for (let i = frontmatterEnd(lines); i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (HEADING_RE.test(line)) heading = line.trimEnd();
    const hasGifSettings = (lines[i + 1] ?? '').trimStart().startsWith(GIF_SETTINGS_PREFIX);
    for (const match of line.matchAll(IMAGE_RE)) {
      const src = match[2].replace(/^<|>$/g, '');
      if (hasGifSettings && src.toLowerCase().split(/[?#]/)[0].endsWith('.gif')) continue;
      images.push({ index: images.length, src, alt: match[1], line: i + 1, heading });
    }
  }
  return images;
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

async function realRoot(rootDir: string): Promise<string> {
  return fs.realpath(rootDir);
}

/** realpath がワークスペース内に収まるか（シンボリックリンクで外へ出る指定を拒否する） */
async function resolveInsideRoot(root: string, target: string): Promise<string> {
  const real = await fs.realpath(target);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error('Access denied: path outside root directory');
  }
  return real;
}

type ImageSource =
  | { kind: 'data'; mimeType: string; bytes: Buffer }
  | { kind: 'file'; absPath: string }
  | { kind: 'rejected'; reason: string };

function classifySrc(src: string, mdDir: string): ImageSource {
  if (src.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(src);
    if (!match) return { kind: 'rejected', reason: 'unsupported data URI (base64 only)' };
    return { kind: 'data', mimeType: match[1], bytes: Buffer.from(match[2], 'base64') };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) {
    return { kind: 'rejected', reason: 'external URL is not fetched' };
  }
  let decoded = src.split(/[?#]/)[0];
  try {
    decoded = decodeURI(decoded);
  } catch {
    // 不正な % エスケープはそのまま扱う（実在しなければ読み取りで失敗として報告される）
  }
  return { kind: 'file', absPath: path.resolve(mdDir, decoded) };
}

async function readFileHead(absPath: string, bytes: number): Promise<Buffer> {
  const handle = await fs.open(absPath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function probeSize(source: ImageSource, root: string): Promise<{ size?: ImageSize; reason?: string }> {
  try {
    if (source.kind === 'rejected') return { reason: source.reason };
    const head = source.kind === 'data'
      ? source.bytes
      : await readFileHead(await resolveInsideRoot(root, source.absPath), SIZE_PROBE_BYTES);
    const size = readImageSize(head);
    return size ? { size } : { reason: 'image format not supported for size detection' };
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
}

async function loadImageData(
  source: ImageSource,
  root: string,
): Promise<{ mimeType: string; data: string } | { reason: string }> {
  if (source.kind === 'rejected') return { reason: source.reason };
  if (source.kind === 'data') {
    if (source.bytes.length > MAX_IMAGE_BYTES) return { reason: 'image exceeds 5 MB limit' };
    return { mimeType: source.mimeType, data: source.bytes.toString('base64') };
  }
  const mimeType = MIME_BY_EXT[path.extname(source.absPath).toLowerCase()];
  if (!mimeType) return { reason: `unsupported image type: ${path.extname(source.absPath)}` };
  try {
    const real = await resolveInsideRoot(root, source.absPath);
    const stat = await fs.stat(real);
    if (stat.size > MAX_IMAGE_BYTES) return { reason: 'image exceeds 5 MB limit' };
    return { mimeType, data: (await fs.readFile(real)).toString('base64') };
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  }
}

interface ParsedLine {
  key: string;
  index: number;
  srcKey: string;
  annotations: ImageAnnotation[];
}

function parseBlockLines(
  lines: ReadonlyArray<{ key: string; data: string }>,
  skipped: ImageAnnotationsResult['skipped'],
): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  for (const { key, data } of lines) {
    const parsedKey = parseAnnotationKey(key);
    if (!parsedKey) {
      skipped.push({ key, reason: 'invalid key (expected img<index>:<src>)' });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      skipped.push({ key, reason: 'annotation data is not valid JSON' });
      continue;
    }
    if (!Array.isArray(raw)) {
      skipped.push({ key, reason: 'annotation data is not a JSON array' });
      continue;
    }
    const annotations = parseAnnotations(data);
    if (annotations.length < raw.length) {
      skipped.push({ key, reason: `${raw.length - annotations.length} annotation(s) missing required fields` });
    }
    if (annotations.length > 0) parsed.push({ key, ...parsedKey, annotations });
  }
  return parsed;
}

/**
 * Markdown に保存された画像アノテーションを画像単位に構造化して返す（読み取り専用）。
 * 要件: spec/35.mcp/05.image-annotation-reader/image-annotation-reader-requirements.ja.md
 */
export async function getImageAnnotations(
  input: GetImageAnnotationsInput,
  rootDir: string,
): Promise<ImageAnnotationsResult> {
  const resolved = resolveSecurePath(rootDir, input.path);
  validateFileExtension(resolved, ALLOWED_EXTENSIONS);
  const root = await realRoot(rootDir);
  const mdPath = await resolveInsideRoot(root, resolved);
  const text = await fs.readFile(mdPath, 'utf-8');
  const mdDir = path.dirname(mdPath);

  const { lines, malformed, body } = extractImageAnnotationBlock(text);
  const result: ImageAnnotationsResult = {
    path: input.path, images: [], unmatched: [], skipped: [], imageData: [], imageErrors: [],
  };
  for (const line of malformed) result.skipped.push({ line, reason: 'line has no "=" separator' });

  const bodyImages = listBodyImages(body);
  const keep = (a: ImageAnnotation) => input.includeResolved === true || a.resolved !== true;

  for (const entry of parseBlockLines(lines, result.skipped)) {
    if (input.imageIndex !== undefined && entry.index !== input.imageIndex) continue;
    const annotations = entry.annotations.filter(keep);
    if (annotations.length === 0) continue;

    const image = bodyImages[entry.index];
    if (!image || !matchesAnnotationSrcKey(image.src, entry.srcKey)) {
      const reason = image
        ? `src mismatch: image #${entry.index} is ${truncateSrc(buildAnnotationKey(entry.index, image.src))}`
        : `no image at index ${entry.index}`;
      result.unmatched.push({ key: entry.key, reason, annotations: annotations.map((a) => toView(a, undefined)) });
      continue;
    }

    const source = classifySrc(image.src, mdDir);
    const { size, reason } = await probeSize(source, root);
    const view: ImageEntry = { ...image, src: truncateSrc(image.src), annotations: annotations.map((a) => toView(a, size)) };
    if (size) view.size = size;
    else view.sizeUnavailableReason = reason;
    result.images.push(view);

    if (input.includeImages === true) {
      if (result.imageData.length >= MAX_IMAGES_PER_CALL) {
        result.imageErrors.push({ index: image.index, reason: `per-call image limit (${MAX_IMAGES_PER_CALL}) reached` });
        continue;
      }
      const loaded = await loadImageData(source, root);
      if ('reason' in loaded) result.imageErrors.push({ index: image.index, reason: loaded.reason });
      else result.imageData.push({ index: image.index, ...loaded });
    }
  }
  return result;
}
