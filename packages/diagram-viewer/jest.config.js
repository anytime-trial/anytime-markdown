const base = require('../../jest.config.base');
/** @type {import('jest').Config} */
module.exports = {
  ...base,
  preset: 'ts-jest',
  // 図は DOM を組み立てるので jsdom で回す。純ロジックは diagram-core 側で測る。
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@anytime-markdown/diagram-core$': '<rootDir>/../diagram-core/src/index.ts',
    '^@anytime-markdown/ui-core/i18n$': '<rootDir>/../ui-core/src/i18n.ts',
  },
};
