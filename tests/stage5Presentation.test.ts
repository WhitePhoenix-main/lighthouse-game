import { describe,it,expect } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import { UPGRADES } from '../src/content/upgrades';
import { LighthouseApplication } from '../src/application/gameApplication';
import { createBattle } from '../src/simulation/battle';
import { battleDevicePanel,defenseDeviceDescription } from '../src/presentation/shared/devices';
import { preparationDevices } from '../src/presentation/preparation/preparation';
import { upgradeValue } from '../src/presentation/screens';
import { shieldStatus,bellSlowStatus } from '../src/presentation/battle/nightPresentation';
import { translate } from '../src/presentation/shared/localization';
const app=()=>new LighthouseApplication({read:()=>null,write:()=>{}},NIGHT_CONFIG,()=>({id:'stage5-ui',seed:1}));
function scenario(){
 const application=app(),config=structuredClone(NIGHT_CONFIG);
 Object.assign(config.devices.cannon,{manualDamageBonus:.25,armorMultiplier:1.5});
 Object.assign(config.devices.barrier,{incomingDamageMultiplier:.85,chargeDamageMultiplier:.65,breakSlowMultiplier:.65,breakSlowSeconds:1.5,breakSlowRadius:70,repairCostMultiplier:.75});
 Object.assign(config.devices.generator,{incomingDamageMultiplier:.8,lastStandEnabled:true,residualSeconds:3});
 const battle=createBattle(config,1,undefined,[{id:1,kind:'cannon',x:-80,y:0},{id:2,kind:'barrier',x:-100,y:50},{id:3,kind:'generator',x:-100,y:-50}]);
 return {...application.view,config,battle};
}
describe('stage five device presentation',()=>{
 it('explains manual bonus identity and projects consumed targets without changing aim',()=>{
  const view=scenario(),device=view.battle.devices[0]!;device.manualBonusTargets=[44,0];const angle=view.battle.desiredBeamAngle;
  view.config.devices.definitions.cannon.attackInterval=.6000000000000001;const html=battleDevicePanel(view,1,false,'');expect(html).toContain('интервал 0.6 с');expect(html).not.toContain('6000000000000001');expect(html).toContain('+25%');expect(html).toContain('все щупальца — один босс');expect(html).toContain('Бонус использован по целям: 2');expect(html).toContain('урон броне ×1.5');expect(view.battle.desiredBeamAngle).toBe(angle);
 });
 it('shows barrier guard, strongest slow rule and discounted invoice',()=>{
  const view=scenario(),html=battleDevicePanel(view,2,false,'');expect(html).toContain('урон рывка ×0.65');expect(html).toContain('сильнейшее замедление');expect(html).toContain('Стоимость ремонта ×0.75');expect(html).not.toContain('data-action="choose-target"');
  view.preparation.inventory=[{id:2,kind:'barrier',health:85,maxHealth:170,consumed:false,position:null,repairCost:1,rechargeCost:0}];expect(preparationDevices(view)).toContain('85/170');expect(preparationDevices(view)).toContain('Ремонт · 1 ◈');
 });
 it('distinguishes fuse readiness, spending and residual duration without imaginary recharge',()=>{
  const view=scenario(),generator=view.battle.devices[2]!;expect(battleDevicePanel(view,3,false,'')).toContain('Предохранитель готов.');
  generator.lastStandUsed=true;generator.health=0;generator.residualUntilTick=view.battle.tick+60;view.battle.shield.maximum=60;view.battle.shield.current=20;
  const html=battleDevicePanel(view,3,false,'');expect(html).toContain('Предохранитель использован.');expect(html).toContain('Остаточное поле активно: 2.0 с.');expect(html).toContain('Не добавляет заряд.');expect(shieldStatus(view.battle,view.config)).toContain('Без живых генераторов');expect(shieldStatus(view.battle,view.config)).not.toContain('Восстановление +');
 });
 it('names barrier debris independently from bell sources',()=>{
  const view=scenario();expect(bellSlowStatus({bellSlows:[{sourceId:2,multiplier:.65,untilTick:45}]},0,view.battle.devices)).toContain('ОБЛОМКИ');expect(bellSlowStatus({bellSlows:[{sourceId:2,multiplier:.65,untilTick:45}]},45,view.battle.devices)).toBe('');
 });
 it('translates all new upgrade values and ability explanations',()=>{
  const view=scenario();for(const node of UPGRADES.slice(-18))expect(translate(node.name+' '+upgradeValue(node.effect.stat,node.effect.amount),'en')).not.toMatch(/[А-Яа-яЁё]/);
  for(const kind of ['cannon','barrier','generator'] as const)expect(translate(defenseDeviceDescription(view,kind,view.battle.devices.find(d=>d.kind===kind)),'en')).not.toMatch(/[А-Яа-яЁё]/);
  expect(upgradeValue('barrierRepairReduction',.75)).toBe('×0.75 стоимости ремонта');
 });
});
