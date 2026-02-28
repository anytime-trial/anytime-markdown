import { WebFileSystemProvider } from '../lib/WebFileSystemProvider';

describe('WebFileSystemProvider', () => {
  test('supportsDirectAccess は showOpenFilePicker の存在に依存', () => {
    const provider = new WebFileSystemProvider();
    expect(provider.supportsDirectAccess).toBe(false); // jsdom has no showOpenFilePicker
  });
});
