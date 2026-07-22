import path from 'node:path';

export function resolveSecurePath(rootDir: string, userPath: string): string {
  const resolved = path.resolve(rootDir, userPath);
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('Access denied: path outside root directory');
  }
  return resolved;
}

export function validateGraphExtension(filePath: string): void {
  if (!filePath.endsWith('.graph')) {
    throw new Error('File type not allowed. Only .graph files are supported.');
  }
}

export function validateCooccurrenceExtension(filePath: string): void {
  if (!filePath.endsWith('.cooc.json')) {
    throw new Error('File type not allowed. Only .cooc.json files are supported.');
  }
}
