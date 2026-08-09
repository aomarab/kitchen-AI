/**
 * React Native's `fetch` is `whatwg-fetch`, which predates streams: every
 * `Response` reports `body === null`. MSW rebuilds each mocked response as
 * `new FetchResponse(rawResponse.body, …)`, so every mock arrives with the
 * right status and headers and an empty payload.
 *
 * Teaching `Response` about streams — a lazy `body` getter, plus a constructor
 * that accepts a stream — closes the gap in both directions and leaves the
 * buffered `whatwg-fetch` behaviour untouched for everything else.
 */

type StreamLike = ReadableStream<Uint8Array<ArrayBuffer>>;

const NativeResponse = globalThis.Response;

const NATIVE = {
  text: NativeResponse.prototype.text,
  clone: NativeResponse.prototype.clone,
} as const;

/** Bodies handed to the constructor as a stream, kept until something drains them. */
const streamBodies = new WeakMap<object, StreamLike>();
/** Streams synthesised on demand by the `body` getter, so repeat reads are stable. */
const synthesisedBodies = new WeakMap<object, StreamLike>();

function isReadableStream(value: unknown): value is StreamLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StreamLike).getReader === 'function'
  );
}

async function drain(stream: StreamLike): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}

class StreamAwareResponse extends NativeResponse {
  constructor(body?: BodyInit | StreamLike | null, init?: ResponseInit) {
    if (isReadableStream(body)) {
      super(null, init);
      streamBodies.set(this, body);
      return;
    }

    super(body as BodyInit | null | undefined, init);
  }

  override get body(): StreamLike | null {
    const provided = streamBodies.get(this);
    if (provided) return provided;

    const synthesised = synthesisedBodies.get(this);
    if (synthesised) return synthesised;

    // Read through a clone so exposing `body` never marks this response used.
    const source = NATIVE.clone.call(this) as Response;
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller) {
        const text = await NATIVE.text.call(source);
        if (text.length > 0) controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });

    synthesisedBodies.set(this, stream);
    return stream;
  }

  override async text(): Promise<string> {
    const provided = streamBodies.get(this);
    if (!provided) return NATIVE.text.call(this);

    streamBodies.delete(this);
    const text = await drain(provided);
    // Re-seed the buffered body so `clone()` and repeat reads keep working.
    streamBodies.set(this, new StreamAwareResponse(text).body as StreamLike);
    return text;
  }

  override async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    if (!streamBodies.has(this)) return NativeResponse.prototype.arrayBuffer.call(this);
    return new TextEncoder().encode(await this.text()).buffer as ArrayBuffer;
  }

  override async blob(): Promise<Blob> {
    if (!streamBodies.has(this)) return NativeResponse.prototype.blob.call(this);
    return new Blob([await this.text()], { type: this.headers.get('content-type') ?? '' });
  }

  override clone(): Response {
    if (!streamBodies.has(this)) return NATIVE.clone.call(this);

    const copy = new StreamAwareResponse(null, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
    });
    // Both copies must see the payload, so tee rather than share the reader.
    const [mine, theirs] = (streamBodies.get(this) as StreamLike).tee();
    streamBodies.set(this, mine);
    streamBodies.set(copy, theirs);
    return copy;
  }
}

globalThis.Response = StreamAwareResponse as unknown as typeof Response;

export {};
