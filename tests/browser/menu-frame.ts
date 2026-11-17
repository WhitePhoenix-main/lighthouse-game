import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { mountGame } from '../../src/presentation/game';

let raw: string | null = null;
const parameters = new URLSearchParams(location.search);
const settings = { version: 3, language: parameters.get('language') === 'en' ? 'en' : 'ru',
  textSize: parameters.get('size') === 'large' ? 'large' : 'normal', soundEnabled: false, musicVolume: 50, effectsVolume: 70 };
const application = new LighthouseApplication({ read: () => raw, write: value => { raw = value; } },
  NIGHT_CONFIG, () => ({ id: 'menu-preview', seed: 42 }), { read: () => JSON.stringify(settings), write: () => {} });
const game = mountGame(document.querySelector<HTMLElement>('#app')!, application);
import.meta.hot?.dispose(() => game.destroy());
