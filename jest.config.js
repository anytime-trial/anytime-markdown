/** @type {import('jest').Config} */
const config = {
  projects: [
    "<rootDir>/packages/markdown-core",
    "<rootDir>/packages/spreadsheet-core",
    "<rootDir>/packages/spreadsheet-viewer",
    "<rootDir>/packages/web-app",
  ],
};

module.exports = config;
