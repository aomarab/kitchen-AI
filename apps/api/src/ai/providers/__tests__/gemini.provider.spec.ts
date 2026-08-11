import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../gemini.provider.js';
import { readSpend } from '../../ai-spend.js';

// vi.hoisted ensures the mock fn is available when vi.mock factory runs (which
// is hoisted to the top of the file, before const declarations are evaluated).
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  FinishReason: { MAX_TOKENS: 'MAX_TOKENS' },
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

  it('caps SDK retry attempts at PROVIDER_MAX_RETRIES + 1', async () => {
    // The SDK's HttpRetryOptions.attempts counts total attempts including the
    // original request (genai.d.ts line 7113), while PROVIDER_MAX_RETRIES
    // counts only retries — matching OpenAI's maxRetries convention. The
    // mapping must add 1, not pass the raw value. For the vision tier:
    // PROVIDER_MAX_RETRIES.vision = 2, so the SDK should receive attempts = 3.
    // Passing the raw value (2) would silently halve the retry budget.
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(request());

    const config = generateContent.mock.calls[0]![0].config;
    expect(config.httpOptions.retryOptions.attempts).toBe(3); // PROVIDER_MAX_RETRIES.vision (2) + 1
  });

  it('sets an AbortSignal on the config so the timeout is enforced', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(request());

    const config = generateContent.mock.calls[0]![0].config;
    expect(config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('appends the repair context as a text part when repairOf is set', async () => {
    generateContent.mockResolvedValue({
      text: '{}',
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await provider.complete(
      request({
        repairOf: { previousRaw: { bad: true }, error: 'missing field items' },
      }),
    );

    const parts = generateContent.mock.calls[0]![0].contents[0].parts;
    const repairPart = parts.find(
      (p: { text?: string }) => p.text?.includes('missing field items') && p.text.includes('"bad":true'),
    );
    expect(repairPart).toBeDefined();
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

    // The fetch must carry the operation-wide abort signal so a wedged download
    // cannot hold the request open past the tier timeout.
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/a.jpg',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const parts = generateContent.mock.calls[0]![0].contents[0].parts;
    expect(parts.some((p: { inlineData?: unknown }) => p.inlineData)).toBe(true);
    fetchSpy.mockRestore();
  });

  it('throws instead of shipping an S3 error body when the image fetch is not ok', async () => {
    // An expired or denied presigned GET returns an XML error body with a 403.
    // Base64-ing that and labelling it image/jpeg is a guaranteed-useless billed
    // request; the provider must fail before ever calling the model.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<Error><Code>AccessDenied</Code></Error>', {
        status: 403,
        headers: { 'content-type': 'application/xml' },
      }),
    );

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await expect(
      provider.complete(request({ images: [{ url: 'https://example.test/expired.jpg' }] })),
    ).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE_ERROR' });
    expect(generateContent).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('GeminiProvider truncation guard', () => {
  beforeEach(() => { generateContent.mockReset(); });

  it('throws AI_INVALID_OUTPUT when finishReason is MAX_TOKENS', async () => {
    generateContent.mockResolvedValue({
      text: '{"items":[',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 8192 },
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    await expect(provider.complete(request())).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
      details: expect.objectContaining({ reason: 'truncated' }),
    });
  });

  it('attaches spend to the error so the gateway can bill the failed attempt', async () => {
    generateContent.mockResolvedValue({
      text: '{"items":[',
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 8192 },
      candidates: [{ finishReason: 'MAX_TOKENS' }],
    });

    const provider = new GeminiProvider('key', { vision: 'gemini-3-flash' });
    let thrown: unknown;
    try {
      await provider.complete(request());
    } catch (e) {
      thrown = e;
    }

    // An error without spend is precisely the bug being fixed: RoutedAiProvider
    // calls readSpend(error) to populate priorAttempts. If readSpend returns
    // null, the failed Gemini call is silently dropped from the billing ledger.
    const spend = readSpend(thrown);
    expect(spend).not.toBeNull();
    expect(spend!.usage).toEqual({ inputTokens: 120, outputTokens: 8192 });
    expect(spend!.model).toBe('gemini-3-flash');
  });
});
