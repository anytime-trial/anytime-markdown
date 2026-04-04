#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Use bundled dist if available, otherwise fall back to ts-node for development
const distPath = path.resolve(__dirname, '../dist/cli.js');
if (fs.existsSync(distPath)) {
  require(distPath);
} else {
  // Development fallback: use ts-node
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
    },
  });
  require('../src/cli.ts');
}
