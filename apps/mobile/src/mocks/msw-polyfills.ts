/**
 * Hermes is missing two Web APIs that MSW touches while its modules evaluate,
 * so `import 'msw'` throws before a single handler is registered:
 *
 * - `MessageEvent`, subclassed by the Server-Sent Events interceptor.
 * - `BroadcastChannel`, instantiated at module scope by the WebSocket handler.
 *
 * React Native already provides `Event`, `EventTarget` and the stream types, so
 * only these two are filled in. This module must be imported before any MSW
 * import — see `server.native.ts`.
 */

type MessageEventInitLike = {
  data?: unknown;
  origin?: string;
  lastEventId?: string;
  source?: unknown;
  ports?: readonly unknown[];
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
};

// Deliberately not intersected with `typeof globalThis`: TypeScript's DOM lib
// already declares both names, and an intersection would demand the polyfills
// match those declarations exactly (`initMessageEvent` and friends) even though
// MSW never touches those members.
const globalScope = globalThis as unknown as {
  MessageEvent?: unknown;
  BroadcastChannel?: unknown;
};

if (typeof globalScope.MessageEvent !== 'function') {
  class MessageEventPolyfill extends Event {
    readonly data: unknown;
    readonly origin: string;
    readonly lastEventId: string;
    readonly source: unknown;
    readonly ports: readonly unknown[];

    constructor(type: string, init: MessageEventInitLike = {}) {
      super(type, init);
      this.data = init.data ?? null;
      this.origin = init.origin ?? '';
      this.lastEventId = init.lastEventId ?? '';
      this.source = init.source ?? null;
      this.ports = init.ports ?? [];
    }
  }

  globalScope.MessageEvent = MessageEventPolyfill;
}

if (typeof globalScope.BroadcastChannel !== 'function') {
  const openChannels = new Map<string, Set<BroadcastChannelPolyfill>>();

  class BroadcastChannelPolyfill extends EventTarget {
    readonly name: string;
    closed = false;
    onmessage: ((event: Event) => void) | null = null;
    onmessageerror: ((event: Event) => void) | null = null;

    constructor(name: string) {
      super();
      this.name = String(name);

      const peers = openChannels.get(this.name) ?? new Set<BroadcastChannelPolyfill>();
      peers.add(this);
      openChannels.set(this.name, peers);
    }

    postMessage(data: unknown): void {
      if (this.closed) {
        throw new Error('InvalidStateError: BroadcastChannel is closed');
      }

      const peers = openChannels.get(this.name);
      if (!peers) return;

      // A real BroadcastChannel never echoes back to its own sender, and always
      // delivers asynchronously.
      for (const peer of peers) {
        if (peer === this) continue;
        queueMicrotask(() => {
          if (peer.closed) return;
          const event = new MessageEvent('message', { data });
          peer.onmessage?.(event);
          peer.dispatchEvent(event);
        });
      }
    }

    close(): void {
      if (this.closed) return;
      this.closed = true;

      const peers = openChannels.get(this.name);
      if (!peers) return;
      peers.delete(this);
      if (peers.size === 0) openChannels.delete(this.name);
    }
  }

  globalScope.BroadcastChannel = BroadcastChannelPolyfill;
}
