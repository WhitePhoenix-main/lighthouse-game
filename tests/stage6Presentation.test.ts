import { describe,it,expect } from 'vitest';
import { NIGHT_CONFIG } from '../src/content/night';
import { UPGRADES } from '../src/content/upgrades';
import { LighthouseApplication } from '../src/application/gameApplication';
import { createBattle } from '../src/simulation/battle';
import { battleDevicePanel,defenseDeviceDescription,trapChargeStatus } from '../src/presentation/shared/devices';
import { preparationDevices } from '../src/presentation/preparation/preparation';
import { upgradeValue } from '../src/presentation/screens';
import { bellSlowStatus } from '../src/presentation/battle/nightPresentation';
import { translate } from '../src/presentation/shared/localization';
function scenario(){
 const app=new LighthouseApplication({read:()=>null,write:()=>{}},NIGHT_CONFIG,()=>({id:'stage6-ui',seed:1})),config=structuredClone(NIGHT_CONFIG);
 Object.assign(config.devices.harpoon,{slowMultiplier:.8,slowSeconds:.6,flyingDamageMultiplier:1.35});
 Object.assign(config.devices.trap,{charges:2,rearmSeconds:2.5,damage:90,blastRadius:105,armorMultiplier:1.5});
 const battle=createBattle(config,1,undefined,[{id:1,kind:'harpoon',x:-80,y:0},{id:2,kind:'light-trap',x:-100,y:50}]);
 return {...app.view,config,battle};
}
describe('stage six device presentation',()=>{
 it('shows partially charged inventory and enables independently quoted paid refill',()=>{
  const view=scenario();Object.assign(view.profile,{resources:100});view.preparation.inventory=[{id:2,kind:'light-trap',health:22.5,maxHealth:45,consumed:false,trapCharges:1,position:null,repairCost:2,rechargeCost:2}];
  const html=preparationDevices(view);expect(html).toContain('Заряды 1/2');expect(html).toContain('22.5/45');expect(html).toMatch(/data-action="recharge-device" data-device-id="2" >Перезарядить · 2/);
  view.preparation.inventory[0]!.rechargeCost=0;expect(preparationDevices(view)).toMatch(/data-action="recharge-device" data-device-id="2" disabled/);
 });
 it('projects charges, rearm delay, exhaustion and destruction without changing battle',()=>{
  const view=scenario(),trap=view.battle.devices[1]!;trap.trapCharges=1;trap.trapReadyTick=75;
  expect(trapChargeStatus(view,trap)).toContain('Заряды 1/2 · Следующий взрыв через 2.5 с');
  const angle=view.battle.desiredBeamAngle,html=battleDevicePanel(view,2,false,'');expect(html).toContain('урон броне ×1.5');expect(html).toContain('Расходует один заряд');expect(html).not.toMatch(/одноразов/i);expect(view.battle.desiredBeamAngle).toBe(angle);
  trap.health=0;expect(trapChargeStatus(view,trap)).toContain('Разрушено');trap.health=45;trap.trapCharges=0;expect(trapChargeStatus(view,trap)).toContain('Израсходована');
 });
 it('explains movement-only tether and flying damage and names its slow source',()=>{
  const view=scenario(),html=battleDevicePanel(view,1,false,'');expect(html).toContain('урон летающим ×1.35');expect(html).toContain('Только движение; атаки продолжаются');expect(html).toContain('сильнейшее замедление');
  expect(bellSlowStatus({bellSlows:[{sourceId:1,multiplier:.8,untilTick:18}]},0,view.battle.devices)).toContain('ГАРПУН');
 });
 it('translates new names, modifier units, charge states and full ability descriptions',()=>{
  const view=scenario();for(const node of UPGRADES.slice(-11))expect(translate(node.name+' '+upgradeValue(node.effect.stat,node.effect.amount),'en')).not.toMatch(/[А-Яа-яЁё]/);
  for(const kind of ['harpoon','light-trap'] as const)expect(translate(defenseDeviceDescription(view,kind,view.battle.devices.find(d=>d.kind===kind)),'en')).not.toMatch(/[А-Яа-яЁё]/);
  expect(translate(view.config.devices.definitions['light-trap'].description,'en')).not.toMatch(/[А-Яа-яЁё]/);
  expect(translate('Заряды 1/2 · Следующий взрыв через 2.5 с','en')).not.toMatch(/[А-Яа-яЁё]/);
 });
});
