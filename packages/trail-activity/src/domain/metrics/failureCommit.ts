export const FIX_WINDOW_MS = 168 * 60 * 60 * 1000; // 7 days

const NON_CODE_EXTENSIONS = new Set<string>([
  'md', 'mdx', 'txt', 'rst', 'adoc', 'asciidoc',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'mp3', 'wav', 'webm', 'mov',
  'snap',
]);

const NON_CODE_FILENAMES = new Set<string>([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json',
  'composer.lock', 'Gemfile.lock', 'Cargo.lock', 'poetry.lock',
]);

export function isCodeFile(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  if (NON_CODE_FILENAMES.has(base)) return false;
  const dot = base.lastIndexOf('.');
  if (dot === -1) return true;
  const ext = base.slice(dot + 1).toLowerCase();
  return !NON_CODE_EXTENSIONS.has(ext);
}

export function filterCodeFiles(files: readonly string[]): string[] {
  return files.filter(isCodeFile);
}

export function isFailureCommit(subject: string): boolean {
  const lower = subject.toLowerCase();
  if (/^fix(\([^)]*\))?!?:\s/.test(lower)) return true;
  if (/^revert(\([^)]*\))?!?:\s/.test(lower)) return true;
  if (/^hotfix(\([^)]*\))?!?:\s/.test(lower)) return true;
  return false;
}

export function hasFileOverlap(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  for (const f of b) {
    if (set.has(f)) return true;
  }
  return false;
}
