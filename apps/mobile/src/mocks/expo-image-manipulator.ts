/** Stub for the node/vitest test environment — native bindings cannot run here. */
export enum SaveFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

/** Last recorded call arguments — reset between tests via resetManipulatorCalls(). */
export let lastManipulatorActions: unknown[] = [];

export function resetManipulatorCalls(): void {
  lastManipulatorActions = [];
}

export const manipulateAsync = async (
  _uri: string,
  actions: unknown[],
  _options?: unknown,
): Promise<{ uri: string; width: number; height: number }> => {
  lastManipulatorActions = actions;
  return { uri: _uri, width: 111, height: 222 };
};
