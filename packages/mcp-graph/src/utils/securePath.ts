import path from 'path';

export function resolveSecurePath(rootDir: string, userPath: string): string {
  const resolved = path.resolve(rootDir, userPath);
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('Access denied: path outside root directory');
  }
  return resolved;
}

export function validateGraphExtension(filePath: string): void {
  if (!filePath.endsWith('.graph.json')) {
    throw new Error('File type not allowed. Only .graph.json files are supported.');
  }
}
