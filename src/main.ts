import { LighthouseApplication } from './application/gameApplication';
import { CampaignGameStore } from './application/campaignGameStore';
import { decodeSettings, defaultSettings } from './application/settings';
import { CAMPAIGN_NIGHT_CATALOG } from './content/campaignRuntime';
import { NIGHT_CONFIG } from './content/night';
import { bindLifecycle, BrowserSaveStore, BrowserSettingsStore, CAMPAIGN_SAVE_KEY, newAttemptIdentity } from './platform/browser';
import { mountGame } from './presentation/game';
import { resolveLanguage, translate } from './presentation/shared/localization';

const root = document.querySelector<HTMLElement>('#app')!;
let dispose: (() => void) | undefined;
let releaseLock: (() => void) | undefined;

function startupMessage(ru: string, en: string, canRetry = false): void {
  let settings = defaultSettings();
  try {
    const raw = new BrowserSettingsStore().read();
    if (raw) settings = decodeSettings(raw);
  } catch { /* Startup guidance must remain readable with unavailable local storage. */ }
  const language = resolveLanguage(settings.language, undefined, navigator.languages);
  document.documentElement.lang = language;
  document.documentElement.dataset.textSize = settings.textSize;
  root.innerHTML = `<main class="watch-startup"><section class="watch-dialog watch-gold" role="alert">
    <h1 class="watch-title"></h1><div class="watch-rail"></div><p></p></section></main>`;
  root.querySelector('h1')!.textContent = translate('Свет Авалона', language);
  root.querySelector('p')!.textContent = language === 'en' ? en : ru;
  if (canRetry) {
    const retry = document.createElement('button');
    retry.className = 'watch-button watch-primary';
    retry.textContent = language === 'en' ? 'Try again' : 'Попробовать снова';
    retry.onclick = () => location.reload();
    root.querySelector('section')!.append(retry);
  }
}

async function boot(): Promise<void> {
  const rewardPreview = new URLSearchParams(location.search).get('rewardTest') === '1';
  if (rewardPreview && !import.meta.env.DEV) {
    startupMessage('Стенд тестовых наград доступен в режиме разработки.', 'The test rewards screen is available in development builds.');
    return;
  }
  if (!navigator.locks) {
    startupMessage('Для сохранения нужен браузер с поддержкой Web Locks. Откройте игру по HTTPS или через localhost.', 'Saving requires a browser with Web Locks support. Open the game over HTTPS or localhost.');
    return;
  }
  const saveKey = rewardPreview ? 'lighthouse.campaign.reward-test.v1' : CAMPAIGN_SAVE_KEY;
  await navigator.locks.request(saveKey, { ifAvailable: true }, async lock => {
    if (!lock) {
      startupMessage('Маяк уже открыт в другой вкладке. Закройте её и попробуйте снова.', 'The lighthouse is open in another tab. Close it and try again.', true);
      return;
    }
    const store = new BrowserSaveStore(saveKey);
    const application = new LighthouseApplication(store, NIGHT_CONFIG, newAttemptIdentity,
      new BrowserSettingsStore(rewardPreview ? 'lighthouse.campaign.reward-test.settings.v1' : undefined),
      CAMPAIGN_NIGHT_CATALOG, new CampaignGameStore(store, rewardPreview ? { finish: result => result } : undefined));
    const lifecycle = bindLifecycle(application);
    const game = mountGame(root, application, { allowProfileReload: true });
    dispose = () => { lifecycle(); game.destroy(); };
    await new Promise<void>(resolve => { releaseLock = resolve; });
  });
}

void boot().catch(error => startupMessage(`Не удалось запустить игру. ${String(error)}`, `The game could not start. ${translate(String(error), 'en')}`, true));
import.meta.hot?.dispose(() => { dispose?.(); releaseLock?.(); });

