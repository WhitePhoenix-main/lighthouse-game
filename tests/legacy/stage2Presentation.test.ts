import { describe, it, expect } from 'vitest';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { createBattle } from '../../src/simulation/battle';
import { battleDevicePanel, deviceSymbols } from '../../src/presentation/shared/devices';
import { burnStatus, burnDescription, lensProperties, lensUpgradeEffect } from '../../src/presentation/shared/lenses';
import { mortarFlight } from '../../src/presentation/battle/mortar';
import { screenContent, upgradeValue } from '../../src/presentation/screens';
import { translate } from '../../src/presentation/shared/localization';

describe('stage 2 presentation', () => {
  it('shows mortar controls and ground/boss targets without offering flying targets or mutating snapshots', () => {
    const app = new LighthouseApplication({read: () => JSON.stringify(emptySave()),write: () => {}},NIGHT_CONFIG,() => ({id:'stage2-ui',seed:1}));
    const battle = createBattle(NIGHT_CONFIG,1,undefined,[{id:1,kind:'mortar',x:-90,y:0}]);
    battle.enemies = [{id:20,kind:'bat',x:120,y:0,health:10,armor:0,attackCooldown:0,waveIndex:0},{id:21,kind:'ghost',x:140,y:50,health:10,armor:0,attackCooldown:0,waveIndex:0}];
    const before = JSON.stringify(battle);
    const html = battleDevicePanel({...app.view,screen:'battle',battle},1,true,'');
    expect(html).toContain('data-action="cannon-priority"');
    expect(html).toContain('data-enemy-id="21"');
    expect(html).not.toContain('data-enemy-id="20"');
    expect(html).toContain('быстрый враг может выйти');
    expect(html).toContain('Союзники не получают урон');
    expect(deviceSymbols.mortar).not.toBe(deviceSymbols.cannon);
    expect(JSON.stringify(battle)).toBe(before);
  });
  it('projects fixed landing point and flight height solely from ticks, including pause and bounds', () => {
    const shot = {id:1,deviceId:1,fromX:-100,fromY:0,x:-200,y:100,launchTick:10,impactTick:40,damage:24,blastRadius:55,armorMultiplier:1};
    expect(mortarFlight(shot,10)).toEqual({x:-100,y:0,lift:0,progress:0});
    const flight = mortarFlight(shot,25);
    expect(flight).toEqual({x:-150,y:50,lift:45,progress:.5});
    expect(mortarFlight(shot,25)).toEqual(flight);
    expect(mortarFlight(shot,100).x).toBe(-200);
    expect(mortarFlight(shot,-5).progress).toBe(0);
    expect(shot.x).toBe(-200);
  });
  it('shows burning independently of actual lit target count and ignores dead/expired statuses', () => {
    const battle = createBattle(NIGHT_CONFIG,1);
    battle.enemies = [{id:1,kind:'ghost',x:0,y:100,health:10,armor:0,attackCooldown:0,waveIndex:0,burn:{remainingTicks:30}},{id:2,kind:'ghost',x:20,y:100,health:0,armor:0,attackCooldown:0,waveIndex:0,burn:{remainingTicks:30}}];
    expect(burnStatus(battle)).toBe('Горят: 1');
    expect(battle.litEnemyIds).toEqual([]);
    battle.enemies[0]!.burn!.remainingTicks = 0;
    expect(burnStatus(battle)).toBe('Горят: 0');
  });
  it('reports all 87 paid nodes and translates the new content with meaningful units', () => {
    const app = new LighthouseApplication({read:()=>JSON.stringify(emptySave()),write:()=>{}},NIGHT_CONFIG,()=>({id:'stage2-catalog',seed:1}));
    const html = screenContent({...app.view,screen:'development'},'mortar-reload',false);
    expect(html.match(/data-action="select-upgrade"/g)).toHaveLength(82);
    expect(html.match(/data-action="purchase-lens-upgrade"/g)).toHaveLength(33);
    expect(html.match(/data-action="purchase-lens"/g)).toHaveLength(7);
    expect(html).toContain('3 с → 2.6 с');
    expect(upgradeValue('mortarBlastRadius',65)).toBe('65 радиуса взрыва');
    expect(upgradeValue('mortarProjectileSpeed',270)).toBe('270 скорости снаряда');
    expect(upgradeValue('mortarArmorMultiplier',1.5)).toBe('1.5 множителя урона броне');
    const lens = LENSES.find(lens=>lens.id==='smoldering')!;
    expect(lensProperties(lens)).toContain('горение 6 урона/с');
    const config = structuredClone(NIGHT_CONFIG);config.lens = {id:'smoldering',slowMultiplier:1,armorMultiplier:1,burn:lens.burn};
    expect(burnDescription(config)).toContain('у босса одно общее горение');
    expect(translate(lens.name,'en')).toBe('Smoldering');
    for(const node of LENS_UPGRADES.filter(node=>node.lensId==='smoldering')) {
      expect(translate(node.name+' '+node.description+' '+lensUpgradeEffect(node),'en')).not.toMatch(/[А-Яа-яЁё]/);
    }
  });
});
