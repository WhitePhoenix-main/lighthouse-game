/** A disposable visual fixture, served only by Vite. Not imported by the production entry. */
import type { BattleState, EnemyKind, EnemyState, GameApplication, SaveStore, TextSize } from '../../src/contracts';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { mountGame } from '../../src/presentation/game';
import { grantFixtureDevices } from '../helpers/devices';

const root = document.querySelector<HTMLElement>('#app')!;
let mounted: { destroy(): void } | null = null;
let size: TextSize = 'normal';
let scene = 'overview';
const diagnostic = document.createElement('output');
diagnostic.dataset.fixtureState = '';
diagnostic.style.cssText = 'font:11px monospace;white-space:nowrap;color:#d5e5df';
document.querySelector('.fixture-toolbar')!.append(diagnostic);
function enemy(id: number, kind: EnemyKind, x: number, y: number): EnemyState {
    const def = NIGHT_CONFIG.enemies[kind];
    return { id, kind, x, y, waveIndex: 0, health: def.health, armor: def.armor, attackCooldown: 0 };
}
function render(): void {
    mounted?.destroy();
    diagnostic.textContent = '';
    const save = emptySave(); save.profile.resources = 200;
    const bossScene = ['boss', 'boss-flash', 'boss-blocked', 'boss-loss', 'boss-victory'].includes(scene);
    if (scene === 'campaign-open' || scene === 'campaign-boss' || scene === 'campaign-lenses' || bossScene) {
        save.profile.wonNightIds = ['first-light', 'broken-shore', 'winged-tide'];
        save.profile.legacyEquipment = true;
        save.profile.completedNights = 3;
    }
    if (scene === 'campaign-boss' || scene === 'campaign-lenses') save.profile.resources = 500;
    if (scene === 'campaign-lenses') {
        save.profile.wonNightIds.push('abyss-warden');
        save.profile.bossLevel = 2;
        save.profile.bossMaterials = 12;
        save.profile.completedNights = 4;
    }
    if (!scene.startsWith('campaign')) save.profile.legacyEquipment = true;
    grantFixtureDevices(save.profile);
    let raw = JSON.stringify(save);
    const store: SaveStore = { read: () => raw, write: value => { raw = value; } };
    const settings: SaveStore = { read: () => JSON.stringify({ version: 1, textSize: size }), write: () => {} };
    const config = structuredClone(NIGHT_CONFIG);
    if (scene === 'new-enemies' || scene === 'ship') config.terrain = { shoreX: 0, landOnlyPlacement: true };
    if (scene === 'ship') config.ship = { ...NIGHT_CATALOG.find(night => night.id === 'rescue-trial')!.config.ship! };
    if (scene === 'live-commands') {
        config.enemies.turtle.speed = 0;
        config.enemies.turtle.health = 10000;
    }
    let attemptSequence = 0;
    const app = new LighthouseApplication(store, config, () => ({ id: `visual-fixture-${++attemptSequence}`, seed: 42 }), settings,
        scene.startsWith('campaign') || bossScene ? NIGHT_CATALOG : undefined);
    if (scene.startsWith('campaign')) { mounted = mountGame(root, app); return; }
    if (bossScene) app.selectNight('abyss-warden');
    app.openPreparation();
    if (scene === 'live' || scene === 'live-commands') {
        app.selectDevice('generator'); app.placeDevice(-80, 0);
        app.selectDevice('cannon'); app.placeDevice(90, 0);
        if (scene === 'live-commands') {
            app.start();
            const battle = app.view.battle as BattleState;
            const target = enemy(1, 'turtle', 190, 0);
            target.health = 10000; target.armor = 0; target.attackCooldown = 999;
            battle.enemies = [target]; battle.nextEnemyId = 100;
            battle.waves.forEach((wave, i) => { wave.started = true; wave.spawned = config.waves[i]!.enemies.length; });
            battle.nextWaveAt = Infinity;
            app.command({ type: 'aim', angle: 0 });
        }
        const observed: GameApplication = new Proxy(app, {
            get(target, key) {
                if (key === 'advance') return (delta: number) => {
                    target.advance(delta);
                    const b = target.view.battle;
                    diagnostic.textContent = b ? `tick=${b.tick} aim=${b.beamAngle.toFixed(4)} flash=${b.flash.cooldownRemaining.toFixed(2)} paused=${target.view.paused}` : 'Редактируемая подготовка';
                };
                const value: unknown = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
        mounted = mountGame(root, observed);
        return;
    }
    app.selectDevice('cannon'); app.placeDevice(-100, 0);
    if (scene === 'shield' || scene === 'shield-down' || scene === 'flash' || scene === 'new-enemies' || scene === 'ship' || bossScene) {
        app.selectDevice('generator'); app.placeDevice(app.view.config.terrain ? -70 : 80, app.view.config.terrain ? 80 : 0);
    } else if (scene === 'trap') {
        app.selectDevice('light-trap'); app.placeDevice(180, 80);
    } else { app.selectDevice('barrier'); app.placeDevice(-180, 100); }
    app.start();
    // The fixture arranges synthetic positions; the production UI never has these controls.
    const battle = app.view.battle as BattleState;
    battle.waves.forEach((wave, i) => { wave.started = true; wave.spawned = app.view.config.waves[i]!.enemies.length; });
    battle.nextWaveAt = Infinity;
    if (bossScene) {
        battle.enemies = [enemy(1, 'turtle', -210, 90), enemy(2, 'bat', -210, -100)];
        battle.boss!.tentacles.forEach((tip, index) => {
            tip.x = 175 + index * 15; tip.y = index === 0 ? -18 : index === 1 ? 18 : 0;
        });
        if (scene === 'boss-blocked') battle.enemies.push(enemy(3, 'ghost', 90, 0));
        if (scene === 'boss-flash') app.command({ type: 'flash' });
        if (scene === 'boss-loss') { battle.boss!.health = 0; battle.lighthouseHealth = 0; }
        if (scene === 'boss-victory') {
            battle.boss!.health = 0; battle.enemies = [];
            battle.waves.forEach((wave, i) => { wave.defeated = app.view.config.waves[i]!.enemies.length; });
        }
    } else if (scene === 'new-enemies') {
        const charging = enemy(1, 'minotaur', -240, 30); charging.chargePhase = 'windup'; charging.chargeRemaining = 1;
        battle.enemies = [charging, enemy(2, 'bat', 160, -90), enemy(3, 'bat', -170, 120), enemy(4, 'turtle', -200, -120)];
    } else if (scene === 'ship') {
        battle.enemies = [enemy(1, 'ghost', 260, 0), enemy(2, 'minotaur', -220, -70), enemy(3, 'bat', -190, 100)];
        battle.ship!.progress = 3;
        app.command({ type: 'aim', angle: Math.atan2(battle.ship!.y, battle.ship!.x) });
    } else if (scene === 'shield' || scene === 'shield-down') {
        battle.enemies = [enemy(1, 'ghost', 167, 0), enemy(2, 'turtle', -130, 120), enemy(3, 'ghost', 70, -160)];
        battle.shield.current = scene === 'shield-down' ? 0 : 70;
        battle.shield.recoveryRemaining = 3;
        if (scene === 'shield-down') battle.enemies[0]!.x = 40;
    } else if (scene === 'flash') {
        battle.enemies = [enemy(1, 'turtle', -80, -80), enemy(2, 'ghost', 130, 60), enemy(3, 'ghost', 280, -60)];
        app.command({ type: 'flash' });
    } else if (scene === 'trap') {
        battle.enemies = [enemy(1, 'turtle', 220, 80), enemy(2, 'ghost', 250, 100), enemy(3, 'ghost', -180, -120)];
    } else if (scene === 'armor') {
        const target = enemy(1, 'turtle', 180, 0); target.armor = .5;
        battle.enemies = [target, enemy(2, 'ghost', -170, -90)];
    } else if (scene === 'death') {
        const target = enemy(1, 'ghost', 130, 0); target.health = .5;
        battle.enemies = [target, enemy(2, 'turtle', -170, -90)];
    } else if (scene === 'crowd') {
        battle.enemies = [enemy(1, 'ghost', 30, -29.4), enemy(2, 'ghost', 30, 29.4),
            enemy(3, 'ghost', 0, 42), enemy(4, 'ghost', -12, 40.25),
            enemy(5, 'turtle', -180, 90), enemy(6, 'turtle', -165, 90)];
    } else if (scene === 'defense') {
        battle.devices[0]!.health = 1;
        battle.enemies = [enemy(1, 'turtle', -136, 0), enemy(2, 'ghost', 0, 42), enemy(3, 'ghost', 230, -80)];
    } else {
        battle.enemies = [enemy(1, 'ghost', 150, 0), enemy(2, 'turtle', 250, 0),
            enemy(3, 'ghost', 210, 65), enemy(4, 'turtle', -200, 70),
            enemy(5, 'ghost', 0, -42), enemy(6, 'ghost', 190, -170)];
    }
    battle.nextEnemyId = 100;
    if (scene !== 'ship') app.command({ type: 'aim', angle: 0 });
    app.advance(1000 / 30);
    // Freeze combat ticks to inspect the same real simulation facts at any viewport.
    const fixtureApp: GameApplication = new Proxy(app, {
        get(target, key) {
            if (key === 'advance') return (delta: number) => { if (target.view.battle !== battle) target.advance(delta); };
            const value: unknown = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    mounted = mountGame(root, fixtureApp);
}
document.querySelector('.fixture-toolbar')!.addEventListener('click', event => {
    const selected = (event.target as Element).closest<HTMLButtonElement>('[data-scene]')?.dataset.scene;
    if (!selected) return;
    if (selected === 'large' || selected === 'normal') size = selected;
    else scene = selected;
    render();
});
render();
