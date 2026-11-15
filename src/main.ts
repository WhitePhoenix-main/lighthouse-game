import { LighthouseApplication } from './application/gameApplication';
import { NIGHT_CONFIG } from './content/night';
import { NIGHT_CATALOG } from './content/nights';
import { bindLifecycle, BrowserSaveStore, BrowserSettingsStore, newAttemptIdentity } from './platform/browser';
import { mountGame } from './presentation/game';

const root = document.querySelector<HTMLElement>('#app')!;
let dispose: (() => void) | undefined;
let releaseLock: (() => void) | undefined;

function message(text: string): void {
  root.style.cssText = 'padding:32px;background:#101c26;color:#fff;min-height:100vh;font:18px system-ui;box-sizing:border-box';
  root.textContent = text;
}

async function boot(): Promise<void> {
  if (!navigator.locks) {
    message('Для безопасного локального сохранения нужен браузер с Web Locks. Откройте игру через http://localhost:5173 в современном браузере.');
    return;
  }
  await navigator.locks.request('lighthouse.save.v1', { ifAvailable: true }, async lock => {
    if (!lock) { message('Маяк уже открыт в другой вкладке. Закройте её и обновите эту страницу.'); return; }
    const application = new LighthouseApplication(new BrowserSaveStore(), NIGHT_CONFIG, newAttemptIdentity, new BrowserSettingsStore(), NIGHT_CATALOG);
    const lifecycle = bindLifecycle(application);
    const game = mountGame(root, application);
    dispose = () => { lifecycle(); game.destroy(); };
    await new Promise<void>(resolve => { releaseLock = resolve; });
  });
}

void boot().catch(error => message(`Не удалось запустить игру: ${String(error)}`));
import.meta.hot?.dispose(() => { dispose?.(); releaseLock?.(); });

