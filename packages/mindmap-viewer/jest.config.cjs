/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // graph-core の .ts サブパスを実ソースへ解決（node_modules 経由だと transform されないため）
  moduleNameMapper: {
    '^@anytime-markdown/graph-core/types$': '<rootDir>/../graph-core/src/types',
    '^@anytime-markdown/graph-core/engine$': '<rootDir>/../graph-core/src/engine/index',
    '^@anytime-markdown/graph-core/viewer$': '<rootDir>/../graph-core/src/viewer/index',
  },
};
