import path from 'path';

export function resolveSecurePath(rootDir: string, userPath: string): string {
  const resolved = path.resolve(rootDir, userPath);
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('Access denied: path outside root directory');
  }
  return resolved;
}

export function validateFileExtension(filePath: string, allowedExtensions: string[]): void {
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`File type not allowed: ${ext}. Allowed: ${allowedExtensions.join(', ')}`);
  }
}
