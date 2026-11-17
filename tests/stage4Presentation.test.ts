import { describe,it,expect } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import { UPGRADES } from '../src/content/upgrades';
import { LENSES,LENS_UPGRADES } from '../src/content/lenses';
import { LighthouseApplication } from '../src/application/gameApplication';
import { createBattle } from '../src/simulation/battle';
import { battleDevicePanel,repairLampDescription } from '../src/presentation/shared/devices';
import { preparationDevices } from '../src/presentation/preparation/preparation';
import { upgradeValue } from '../src/presentation/screens';
import { lensProperties,lensUpgradeEffect } from '../src/presentation/shared/lenses';
import { translate } from '../src/presentation/shared/localization';
const app=()=>new LighthouseApplication({read:()=>null,write:()=>{}},NIGHT_CONFIG,()=>({id:'repair-ui',seed:1}));
describe('repair lamp and long-range presentation',()=>{
 it('shows actual charges and starting health without weapon commands',()=>{
  const application=app(),battle=createBattle(NIGHT_CONFIG,1,undefined,[{id:1,kind:'repair-lamp',x:-140,y:0,health:45,consumed:false}]);
  battle.devices[0]!.repairCharges=1;
  const html=battleDevicePanel({...application.view,battle},1,true,'');
  expect(html).toContain('заряды 1');expect(html).toContain('Прочность на старте: 45');
  expect(html).toContain('не выше прочности на старте');expect(html).toContain('Заряды бесплатно');
  expect(html).not.toContain('data-action="choose-target"');expect(html).not.toContain('data-action="cannon-priority"');
 });
 it('shows emergency state from configuration and snapshot',()=>{
  const application=app(),config=structuredClone(NIGHT_CONFIG);config.devices.repairLamp.emergencyEnabled=true;
  const battle=createBattle(config,1,undefined,[{id:1,kind:'repair-lamp',x:-140,y:0}]);
  const view={...application.view,config,battle};expect(battleDevicePanel(view,1,false,'')).toContain('Аварийный ремонт готов.');
  battle.devices[0]!.emergencyRepairUsed=true;expect(battleDevicePanel(view,1,false,'')).toContain('Аварийный ремонт использован.');
  expect(translate(repairLampDescription(view),'en')).not.toMatch(/[А-Яа-яЁё]/);
 });
 it('preparation offers lamp purchases and free nightly charges without trap recharge',()=>{
  const application=app(),view=application.view;view.config.availableDevices=['repair-lamp'];
  view.preparation.inventory=[{id:1,kind:'repair-lamp',health:40,maxHealth:60,consumed:false,position:null,repairCost:4,rechargeCost:0}];
  const html=preparationDevices(view);expect(html).toContain('data-kind="repair-lamp"');expect(html).toContain('3 зарядов на ночь');expect(html).toContain('предел — прочность цели на старте ночи');expect(html).not.toContain('data-action="recharge-device"');
 });
 it('translates all new content, numeric effects and explanatory text',()=>{
  for(const node of UPGRADES.filter(n=>n.id.includes('repair'))) expect(translate(node.name+' '+upgradeValue(node.effect.stat,node.effect.amount),'en')).not.toMatch(/[А-Яа-яЁё]/);
  const lens=LENSES.find(l=>l.id==='long-range')!;expect(lensProperties(lens)).toContain('дальность ×1.15');
  expect(translate(lens.name+' '+lens.description,'en')).not.toMatch(/[А-Яа-яЁё]/);
  for(const node of LENS_UPGRADES.filter(n=>n.lensId==='long-range')) expect(translate(node.name+' '+node.description+' '+lensUpgradeEffect(node),'en')).not.toMatch(/[А-Яа-яЁё]/);
  expect(upgradeValue('repairDamageReduction',.8)).toBe('×0.8 входящего урона');
 });
});
