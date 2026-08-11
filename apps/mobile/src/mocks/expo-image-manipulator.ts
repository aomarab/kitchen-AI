/** Stub for the node/vitest test environment — native bindings cannot run here. */
export enum SaveFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

export const manipulateAsync = async (
  _uri: string,
  _actions: unknown[],
  _options?: unknown,
): Promise<{ uri: string }> => ({ uri: _uri });
