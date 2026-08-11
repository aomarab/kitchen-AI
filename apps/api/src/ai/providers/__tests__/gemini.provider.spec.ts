import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../gemini.provider.js';

// vi.hoisted ensures the mock fn is available when vi.mock factory runs (which
// is hoisted to the top of the file, before const declarations are evaluated).
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

function request(overrides = {}) {
  return {
    operation: 'vision.recognize' as const,
    tier: 'vision' as const,
    system: 'you are a kitchen assistant',
    user: 'what is in this photo',
    ...overrides,
  };
}

describe('GeminiProvider', () => {
  beforeEach(() => { generateContent.mockReset(); });

  it('counts thinking tokens as output tokens', async () => {
    // Gemini bills thinking tokens as output but reports them separately.
    // Mapping only the visible count undercosts every call.
    generateContent.mockResolvedValue({
      text: '{"items":[]}',
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 30,
      },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    const result = await provider.complete(request());

    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('parses the JSON body into raw', async () => {
    generateContent.mockResolvedValue({
      text: '{"items":[{"name":"tomato"}]}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    const result = await provider.complete(request());

    expect(result.raw).toEqual({ items: [{ name: 'tomato' }] });
    expect(result.model).toBe('gemini-3-flash');
  });

  it('treats a missing thoughts count as zero rather than NaN', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    const result = await provider.complete(request());

    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  it('asks for JSON and applies the tier output ceiling', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(request());

    const config = generateContent.mock.calls[0]![0].config;
    expect(config.responseMimeType).toBe('application/json');
    expect(config.maxOutputTokens).toBe(8192); // PROVIDER_MAX_OUTPUT_TOKENS.vision
  });

  it('maps a transport failure onto the app error vocabulary', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('socket hang up'), {}));

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await expect(provider.complete(request())).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it('surfaces a rate limit as RATE_LIMITED', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await expect(provider.complete(request())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('sends images as inline parts when the request carries them', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
    );

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(request({ images: [{ url: 'https://example.test/a.jpg' }] }));

    expect(fetchSpy).toHaveBeenCalledWith('https://example.test/a.jpg');
    const parts = generateContent.mock.calls[0]![0].contents[0].parts;
    expect(parts.some((p: { inlineData?: unknown }) => p.inlineData)).toBe(true);
    fetchSpy.mockRestore();
  });
});
