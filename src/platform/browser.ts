import type { GameApplication, SaveStore } from '../contracts';

export const SAVE_KEY = 'lighthouse.save.v1';
export class BrowserSaveStore implements SaveStore {
  read(): string | null { return localStorage.getItem(SAVE_KEY); }
  write(value: string): void { localStorage.setItem(SAVE_KEY, value); }
}

export const SETTINGS_KEY = 'lighthouse.settings.v1';
export class BrowserSettingsStore implements SaveStore {
  read(): string | null { return localStorage.getItem(SETTINGS_KEY); }
  write(value: string): void { localStorage.setItem(SETTINGS_KEY, value); }
}

export function bindLifecycle(application: GameApplication): () => void {
  const pause = () => application.pause();
  const visibility = () => { if (document.hidden) pause(); };
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', pause);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('blur', pause);
    window.removeEventListener('pagehide', pause);
    document.removeEventListener('visibilitychange', visibility);
  };
}

export function newAttemptIdentity(): { id: string; seed: number } {
  const random = crypto.getRandomValues(new Uint32Array(1));
  return { id: crypto.randomUUID(), seed: random[0]! };
}
