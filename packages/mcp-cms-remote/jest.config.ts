import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@anytime-markdown/cms-core$': '<rootDir>/../cms-core/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};

export default config;
