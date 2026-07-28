import type { MiniTakipApi } from '../main/preload';

declare global {
  interface Window {
    miniTakip: MiniTakipApi;
  }
}
