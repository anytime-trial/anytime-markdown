import {
  createOllamaChatRegistration,
  createOllamaEmbeddingRegistration,
} from '../../src/adapters/OllamaAdapter';

describe('OllamaAdapter', () => {
  describe('createOllamaChatRegistration', () => {
    it('wraps OllamaChatProvider in a ChatProviderRegistration with a derived id', () => {
      const reg = createOllamaChatRegistration({
        baseUrl: 'http://host:11434',
        model: 'llama3',
      });
      expect(reg.kind).toBe('chat');
      expect(reg.id).toBe('ollama-chat:llama3');
      expect(reg.provider.model).toBe('llama3');
    });

    it('honors a caller-supplied id', () => {
      const reg = createOllamaChatRegistration({
        id: 'my-chat',
        baseUrl: 'http://host:11434',
        model: 'llama3',
      });
      expect(reg.id).toBe('my-chat');
    });
  });

  describe('createOllamaEmbeddingRegistration', () => {
    it('wraps OllamaEmbeddingProvider in an EmbeddingProviderRegistration', () => {
      const reg = createOllamaEmbeddingRegistration({
        baseUrl: 'http://host:11434',
        model: 'bge-m3',
        dimensions: 1024,
      });
      expect(reg.kind).toBe('embedding');
      expect(reg.id).toBe('ollama-embedding:bge-m3');
      expect(reg.provider.model).toBe('bge-m3');
      expect(reg.provider.dimensions).toBe(1024);
    });
  });
});
