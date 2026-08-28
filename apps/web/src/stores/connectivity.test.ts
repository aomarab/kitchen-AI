import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { markOffline, markOnline, startConnectivityMonitor, useConnectivity } from './connectivity';

/**
 * The kiosk's connection state (kitchen companion spec — Feature 1).
 *
 * The behaviour worth pinning is the asymmetry between the two sources: the
 * browser's opinion is weaker evidence than a request that actually failed, so
 * they must not be allowed to overwrite each other freely.
 */
describe('web connectivity', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    useConnectivity.setState({ online: true });
    setNavigatorOnline(true);
  });

  afterEach(() => {
    stop?.();
    stop = null;
  });

  function setNavigatorOnline(online: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
  }

  it('starts optimistic so the kiosk never flashes offline on load', () => {
    expect(useConnectivity.getState().online).toBe(true);
  });

  it('goes offline on the browser offline event and back on the online event', () => {
    stop = startConnectivityMonitor();

    window.dispatchEvent(new Event('offline'));
    expect(useConnectivity.getState().online).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(useConnectivity.getState().online).toBe(true);
  });

  it('mounts offline when the browser already knows it is offline', () => {
    setNavigatorOnline(false);
    stop = startConnectivityMonitor();
    expect(useConnectivity.getState().online).toBe(false);
  });

  it('does not let navigator.onLine clear an offline state a failed request established', () => {
    // The captive-portal case: an interface exists, so the browser says online,
    // but our API is unreachable. The request is the stronger evidence.
    markOffline();
    setNavigatorOnline(true);
    stop = startConnectivityMonitor();
    expect(useConnectivity.getState().online).toBe(false);
  });

  it('stops listening once unsubscribed', () => {
    const unsubscribe = startConnectivityMonitor();
    unsubscribe();
    window.dispatchEvent(new Event('offline'));
    expect(useConnectivity.getState().online).toBe(true);
  });

  it('does not notify subscribers when the state is unchanged', () => {
    const seen = vi.fn();
    const unsubscribe = useConnectivity.subscribe(seen);
    markOnline();
    markOnline();
    unsubscribe();
    // Already online: re-asserting it must not re-render every consumer, and
    // the kiosk asserts it on every successful request.
    expect(seen).not.toHaveBeenCalled();
  });
});
