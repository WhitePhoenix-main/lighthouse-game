import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { mountGame } from '../../src/presentation/game';

let profile: string | null = null;
const storage = { raw: null as string | null, fail: false, writes: 0 };
const application = new LighthouseApplication({ read: () => profile, write: value => { profile = value; } },
  NIGHT_CONFIG, () => ({ id: 'settings-preview', seed: 42 }), {
    read: () => storage.raw,
    write: value => { storage.writes++; if (storage.fail) throw Error('Test storage failure'); storage.raw = value; }
  });
const game = mountGame(document.querySelector<HTMLElement>('#app')!, application);
// Browser verification only. This fixture never accesses a real profile or settings store.
Object.assign(window, { settingsTest: { application, storage } });
import.meta.hot?.dispose(() => game.destroy());
