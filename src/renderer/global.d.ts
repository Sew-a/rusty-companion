import type { CompanionApi } from '../preload/preload';

declare global {
  interface Window {
    companion: CompanionApi;
  }
}

export {};
