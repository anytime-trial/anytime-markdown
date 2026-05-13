#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const viewerDistSrc = resolve(
  repoRoot,
  'packages/vscode-trail-extension/dist/trailstandalone.js',
);
const targetDir = resolve(here, '..', 'src', 'viewer-dist');

console.log('[build-viewer-dist] checking viewer source:', viewerDistSrc);

if (!existsSync(viewerDistSrc)) {
  console.log('[build-viewer-dist] viewer not built yet. Building vscode-trail-extension first…');
  execSync('npm run compile --workspace=anytime-trail', {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
mkdirSync(targetDir, { recursive: true });
cpSync(viewerDistSrc, resolve(targetDir, 'trailstandalone.js'));

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Anytime Trail</title>
<style>html,body{margin:0;height:100%}#root{height:100%}</style>
</head><body>
<div id="root"></div>
<script src="./trailstandalone.js"></script>
</body></html>`;
writeFileSync(resolve(targetDir, 'index.html'), html);
console.log('[build-viewer-dist] copied to', targetDir);
