import type { Logger } from '../runtime/Logger';

export function makeMockLogger(): jest.Mocked<Logger> {
  const mock: jest.Mocked<Logger> = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  };
  mock.child.mockReturnValue(mock);
  return mock;
}
