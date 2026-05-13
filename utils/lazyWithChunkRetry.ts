import React from 'react';
import {
  canAttemptChunkRecovery,
  hardRefreshAfterChunkError,
  isLikelyChunkError,
} from './chunkRecovery';

type Importer<T extends React.ComponentType<any>> = () => Promise<{ default: T }>;

export function lazyWithChunkRetry<T extends React.ComponentType<any>>(
  importer: Importer<T>,
  label: string
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      if (isLikelyChunkError(err) && canAttemptChunkRecovery()) {
        void hardRefreshAfterChunkError(`lazy:${label}`);
        return await new Promise<{ default: T }>(() => {});
      }
      try {
        return await importer();
      } catch (retryErr) {
        if (isLikelyChunkError(retryErr) && canAttemptChunkRecovery()) {
          void hardRefreshAfterChunkError(`lazy:${label}`);
          return await new Promise<{ default: T }>(() => {});
        }
        throw retryErr;
      }
    }
  });
}
