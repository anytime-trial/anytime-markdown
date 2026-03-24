/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts", "<rootDir>/src/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  maxWorkers: 2,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/__tests__/**",
    "!src/__mocks__/**",
    "!src/exports/**",
    "!src/index.ts",
    "!src/md.d.ts",
    "!src/i18n/**",
    "!src/page.tsx",
    "!src/version.ts",
    "!src/hooks/useBlockCapture.ts",
    "!src/hooks/useDiagramCapture.ts",
    "!src/components/ImageCropTool.tsx",
    "!src/components/GifRecorderDialog.tsx",
    "!src/components/EditorDialogsSection.tsx",
    "!src/components/EditorMainContent.tsx",
    "!src/components/EditorMergeContent.tsx",
    "!src/components/EditorOutlineSection.tsx",
    "!src/components/EditorToolbarSection.tsx",
  ],
};

module.exports = config;
