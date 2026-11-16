import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { mountGame } from '../../src/presentation/game';
import { bindLifecycle } from '../../src/platform/browser';

const params = new URLSearchParams(location.search);
const save = emptySave();
save.profile.resources = 123;
save.profile.wonNightIds = ['first-light', 'broken-shore'];
let raw: string | null = params.has('saved') ? JSON.stringify(save) : null;
let writes = 0, fail = false;
const settings = { version: 3, language: params.get('language') === 'en' ? 'en' : 'ru', textSize: params.has('large') ? 'large' : 'normal', soundEnabled: false, musicVolume: 50, effectsVolume: 70 };
const app = new LighthouseApplication({ read: () => raw, write(value) { if (fail) throw Error('fixture quota'); raw = value; writes++; } }, NIGHT_CONFIG,
  () => ({ id: `menu-fixture-${writes}`, seed: 42 }), { read: () => JSON.stringify(settings), write: () => {} }, NIGHT_CATALOG);
const fixture = { app, writes: () => writes, raw: () => raw, fail(value: boolean) { fail = value; } };
Object.assign(window, { gameMenuFixture: fixture });
const lifecycle = bindLifecycle(app);
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
import.meta.hot?.dispose(() => { lifecycle(); game.destroy(); });
