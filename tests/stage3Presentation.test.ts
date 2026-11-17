import { describe, it, expect } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import { LENSES,LENS_UPGRADES } from '../src/content/lenses';
import { UPGRADES } from '../src/content/upgrades';
import { createBattle } from '../src/simulation/battle';
import { bellSlowStatus,tentacleStatus } from '../src/presentation/battle/nightPresentation';
import { resonanceStatus,resonanceDescription,lensUpgradeEffect,lensProperties } from '../src/presentation/shared/lenses';
import { upgradeValue } from '../src/presentation/screens';
import { battleDevicePanel } from '../src/presentation/shared/devices';
import { LighthouseApplication } from '../src/application/gameApplication';
import { translate } from '../src/presentation/shared/localization';
describe('bell and resonance presentation',()=>{
 it('projects only active bell effects independently from light and preserves strongest',()=>{
  const enemy={bellSlows:[{sourceId:1,untilTick:20,multiplier:.65},{sourceId:2,untilTick:10,multiplier:.5}]};
  expect(bellSlowStatus(enemy,9)).toBe('КОЛОКОЛ · скорость ×0.5');
  expect(bellSlowStatus(enemy,10)).toBe('КОЛОКОЛ · скорость ×0.65');
  expect(bellSlowStatus(enemy,20)).toBe('');
  const battle=createBattle(NIGHT_CONFIG,1);const tip={id:-1001,x:200,y:0,attackCooldown:0,...enemy};battle.tick=10;
  expect(tentacleStatus(tip,battle,NIGHT_CONFIG)).toContain('КОЛОКОЛ');
  expect(tentacleStatus(tip,battle,NIGHT_CONFIG)).not.toContain('В СВЕТЕ');
  battle.litTentacleIds=[tip.id];expect(tentacleStatus(tip,battle,NIGHT_CONFIG)).toContain('атака остановлена');
 });
 it('shows tick driven resonance progress, readiness, reset and additive rule',()=>{
  const config=structuredClone(NIGHT_CONFIG);const lens=LENSES.find(l=>l.id==='resonant')!;
  config.lens={id:'resonant',slowMultiplier:1,armorMultiplier:1,resonance:lens.resonance};
  const battle=createBattle(config,1);
  expect(resonanceStatus(battle,config)).toContain('сброшен');battle.resonance.ticks=30;
  expect(resonanceStatus(battle,config)).toContain('1.0 / 2 с');battle.resonance.ticks=60;
  expect(resonanceStatus(battle,config)).toContain('готов · +25%');
  expect(resonanceDescription(config)).toContain('Бонус складывается');expect(lensProperties(lens)).toContain('резонанс ≥2 зон');expect(translate(resonanceDescription(config),'en')).not.toMatch(/[А-Яа-яЁё]/);
 });
 it('offers no weapon target commands for a passive bell and uses actual multipliers',()=>{
  const app=new LighthouseApplication({read:()=>null,write:()=>{}},NIGHT_CONFIG,()=>({id:'bell-ui',seed:1}));
  const battle=createBattle(NIGHT_CONFIG,1,undefined,[{id:1,kind:'bell',x:100,y:0}]);
  const html=battleDevicePanel({...app.view,battle},1,true,'');
  expect(html).toContain('Не наносит урон');expect(html).not.toContain('data-action="cannon-priority"');expect(html).not.toContain('data-action="choose-target"');
  expect(upgradeValue('bellDamageReduction',.8)).toBe('×0.8 входящего урона');expect(upgradeValue('bellFirstPulseReduction',.5)).toBe('×0.5 скорости первого импульса');
 });
 it('translates new content and effect labels',()=>{
  for(const node of UPGRADES.filter(n=>n.id.includes('bell'))) expect(translate(node.name,'en')).not.toMatch(/[А-Яа-яЁё]/);
  for(const node of LENS_UPGRADES.filter(n=>n.lensId==='resonant')) expect(translate(node.name+' '+node.description+' '+lensUpgradeEffect(node),'en')).not.toMatch(/[А-Яа-яЁё]/);
 });
});
