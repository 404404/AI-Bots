import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

import type { MemoryPreviewIO } from './memory-preview';

export const nativeMemoryPreview: MemoryPreviewIO = {
  async fetch(source, signal) {
    return fetch(source.uri, {
      headers: source.headers,
      signal,
      credentials: 'omit',
      redirect: 'error',
    });
  },
  store(bytes, extension = 'png') {
    const file = new File(Paths.cache, `memory-preview-${randomUUID()}.${extension}`);
    try {
      file.writeSync(bytes);
    } catch (error) {
      if (file.exists) file.delete();
      throw error;
    }
    return {
      uri: file.uri,
      dispose() {
        if (file.exists) file.delete();
      },
    };
  },
};
