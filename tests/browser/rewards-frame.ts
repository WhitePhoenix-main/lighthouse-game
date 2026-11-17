/** Isolated application: in-memory storage only, no player profile access. */
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { mountGame } from '../../src/presentation/game';
const config = structuredClone(NIGHT_CONFIG);
config.victoryReward = 83;
config.waves = [{ id: 'reward-trial', enemies: ['ghost'], spawnInterval: 0.1 }];
config.enemies = { ...config.enemies, ghost: { ...config.enemies.ghost, health: 1, armor: 0, speed: 0 } };
config.beam = { ...config.beam, range: 10000, halfAngle: Math.PI, damagePerSecond: 1000 };
let saved = JSON.stringify(emptySave()); let fail = false; let identity = 0;
const app = new LighthouseApplication({ read: () => saved, write: raw => { if (fail) throw Error('Fixture save failure'); saved = raw; } }, config, () => ({ id: 'reward-' + ++identity, seed: 42 }));
app.openPreparation();
const advance = app.advance.bind(app);
app.advance = () => {};
const game = mountGame(document.querySelector<HTMLElement>('#app')!, app);
Object.assign(window, { rewardsFixture: { app, fail: (value: boolean) => { fail = value; }, saved: () => saved, finish: (defeat = false) => {
  if (defeat && app.view.battle) Object.assign(app.view.battle, { lighthouseHealth: 0 });
  for (let i = 0; i < 1000 && app.view.screen === 'battle'; i++) advance(100);
} } });
import.meta.hot?.dispose(() => game.destroy());
