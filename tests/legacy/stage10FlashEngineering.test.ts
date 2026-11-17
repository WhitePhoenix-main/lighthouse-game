import { describe, it, expect } from 'vitest';
import type { SaveStore, EnemyState, DevicePlacement } from '../../src/contracts';
import { emptySave, decodeSave, SaveRepository } from '../../src/application/saves';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { DEVICE_RULES } from '../../src/content/devices';
import { calculateNightConfig, getUpgradeAvailability, createUpgradeViews, validateUpgradeDefinitions } from '../../src/progression/upgrades';
import { deviceDeployments, battleDeviceDeployments, normalizedDeviceResults, repairCost, rechargeCost, engineeringRepairMultiplier } from '../../src/progression/devices';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { useFlash } from '../../src/simulation/abilities';
import { checkDraft } from '../../src/application/placement';
import { translate } from '../../src/presentation/shared/localization';
import { upgradeValue } from '../../src/presentation/screens';
import { grantFixtureDevices } from '../helpers/devices';
import { measureBattle } from '../helpers/balancePolicy';

const old=UPGRADES.slice(0,110), added=UPGRADES.slice(110);
const oldIds=old.map(n=>n.id), allIds=UPGRADES.map(n=>n.id);
function prior(){
 const save=emptySave();Object.assign(save.profile,{resources:3000,bossMaterials:59,bossLevel:2,completedNights:6,
 purchasedUpgrades:oldIds,wonNightIds:NIGHT_CATALOG.map(n=>n.id),unlockedLenses:LENSES.map(n=>n.id),lensUpgrades:LENS_UPGRADES.map(n=>n.id)});
 grantFixtureDevices(save.profile);
 const trap=save.profile.devices.find(d=>d.kind==='light-trap')!;trap.health=15.25;trap.trapCharges=1;
 return save;
}
function repository(save=prior()){
 const store:SaveStore & {raw:string;fail?:'before'|'after'}={raw:JSON.stringify(save),read(){return this.raw;},write(raw){if(this.fail==='before')throw Error('quota');this.raw=raw;if(this.fail==='after')throw Error('reply');}};
 const repo=new SaveRepository(store);repo.load();return {repo,store};
}
const config=(expanded=true)=>calculateNightConfig(NIGHT_CONFIG,expanded?allIds:oldIds);
function enemy(id:number,x:number,kind:EnemyState['kind']='ghost',armor=0):EnemyState {
 return {id,kind,x,y:0,health:1000,armor,waveIndex:0,attackCooldown:0};
}
describe('stage 10 purchases and compatibility',()=>{
 it('appends twelve nodes, preserves v6 and previous totals',()=>{
  expect(added).toHaveLength(12);expect(UPGRADES.length+LENS_UPGRADES.length+LENSES.length-1).toBe(162);
  expect(added.reduce((s,n)=>s+n.cost,0)).toBe(1620);
  expect(old.reduce((s,n)=>s+n.cost,0)+LENS_UPGRADES.reduce((s,n)=>s+n.cost,0)).toBe(12990);
  expect(()=>validateUpgradeDefinitions(UPGRADES)).not.toThrow();
  expect(decodeSave(JSON.stringify(prior()))).toEqual(prior());
  expect(repository().repo.current.profile.purchasedUpgrades).toEqual(oldIds);
 });
 it.each(added)('$id gates purchase, previews the right units and translates RU/EN',node=>{
  const p=prior().profile;p.purchasedUpgrades=UPGRADES.slice(0,UPGRADES.indexOf(node)).map(n=>n.id);
  p.wonNightIds=p.wonNightIds.filter(id=>id!=='far-shore');
  expect(getUpgradeAvailability(p,node.id).status).toBe('requires');
  p.wonNightIds=NIGHT_CATALOG.map(n=>n.id);p.resources=node.cost-1;
  expect(getUpgradeAvailability(p,node.id).status).toBe('insufficient');p.resources=node.cost;
  expect(getUpgradeAvailability(p,node.id).status).toBe('available');
  const view=createUpgradeViews(p,NIGHT_CONFIG).find(v=>v.definition.id===node.id)!;
  expect(view.nextValue-view.currentValue).toBeCloseTo(node.effect.amount*(node.effect.stat.endsWith('Reduction')?-1:1));
  expect(translate(node.name+' '+upgradeValue(node.effect.stat,view.nextValue),'en')).not.toMatch(/[А-Яа-яЁё]/);
  p.purchasedUpgrades=[];expect(getUpgradeAvailability(p,node.id).status).toBe('requires');
 });
 it.each(['before','after'] as const)('survives %s-write failure once without healing or recharging',failure=>{
  const {repo,store}=repository(),before=repo.current.profile;
  for(const node of added){
   const snapshot=repo.current;store.fail=failure;
   if(failure==='before'){expect(()=>repo.purchase(node.id)).toThrow();expect(repo.current).toEqual(snapshot);}else repo.purchase(node.id);
   store.fail=undefined;repo.purchase(node.id);repo.purchase(node.id);repo.load();
  }
  expect(repo.current.profile).toEqual({...before,resources:1380,purchasedUpgrades:allIds});
 });
 it('changes only flash, object capacity and paid repair costs',()=>{
  const a=config(false),b=config();
  expect(b.flash).toEqual({...a.flash,damage:46,radius:240,stunDuration:expect.closeTo(2.4),cooldown:14});
  expect(b.devices).toEqual({...a.devices,maxObjects:6});
  expect(b.beam).toEqual(a.beam);expect(b.shield).toEqual(a.shield);
  expect(b.lighthouseHealth).toBe(a.lighthouseHealth);
  expect(engineeringRepairMultiplier(allIds)).toBeCloseTo(.85);
  expect(upgradeValue('repairCostReduction',.85)).toBe('×0.85 стоимости ремонта до округления');
 });
});
describe('stage 10 flash behavior',()=>{
 it('extends radial reach, hits flying enemies and armor, without lens amplification',()=>{
  const c=config();c.lens={id:'armor-breaker',slowMultiplier:1,armorMultiplier:2.5};
  const state=createBattle(c,42);state.enemies=[enemy(1,230),enemy(2,230,'bat'),enemy(3,230,'turtle',30),enemy(4,300)];
  const oldState=createBattle(config(false),42);oldState.enemies=[enemy(1,230)];
  useFlash(oldState,config(false));expect(oldState.enemies[0]!.health).toBe(1000);
  useFlash(state,c);
  expect(state.enemies.map(e=>e.health)).toEqual([954,954,984,1000]);
  expect(state.enemies[2]!.armor).toBe(0);
  expect(state.enemies[0]!.stunnedUntilTick).toBe(72);
  expect(state.enemies[3]!.stunnedUntilTick).toBeUndefined();
  const snapshot=structuredClone(state.enemies);useFlash(state,c);expect(state.enemies).toEqual(snapshot);
 });
 it('allows the next flash after fourteen seconds, with a gap between stuns',()=>{
  const c=config();c.enemies.ghost.speed=0;c.waves=[{id:'new',enemies:['ghost'],spawnInterval:100}];
  const state=createBattle(c,42);state.waves[0]!.spawned=1;state.enemies=[enemy(1,-200)];
  useFlash(state,c);expect(state.flash.cooldownRemaining).toBe(14);
  for(let i=0;i<419;i++)stepBattle(state,c,[]);
  expect(state.tick).toBeGreaterThan(state.enemies[0]!.stunnedUntilTick!);
  useFlash(state,c);expect(state.enemies[0]!.health).toBe(954);
  stepBattle(state,c,[]);useFlash(state,c);expect(state.enemies[0]!.health).toBe(908);
 });
 it('damages the boss once even with several tentacles inside the larger radius',()=>{
  const base=NIGHT_CATALOG.find(n=>n.id==='abyss-warden')!.config;
  const c=calculateNightConfig(base,allIds);const state=createBattle(c,42);
  for(const zone of state.boss!.tentacles){zone.x=150;zone.y=0;}
  const health=state.boss!.health;useFlash(state,c);
  expect(state.boss!.health).toBe(health-46);expect(state.boss!.stunnedUntilTick).toBe(72);
 });
});
describe('stage 10 engineering and economy',()=>{
 it('allows six objects but keeps type caps and does not grant free bodies',()=>{
  const placements:DevicePlacement[]=[
   {id:1,kind:'cannon',x:-100,y:-100},{id:2,kind:'cannon',x:-100,y:100},
   {id:3,kind:'barrier',x:-200,y:-100},{id:4,kind:'barrier',x:-200,y:100},
   {id:5,kind:'generator',x:-150,y:0},{id:6,kind:'harpoon',x:-50,y:180}];
  expect(checkDraft(config(false),placements).valid).toBe(false);
  const one=calculateNightConfig(NIGHT_CONFIG,[...oldIds,'device-objects-1']);
  expect(checkDraft(one,placements.slice(0,5)).valid).toBe(true);expect(checkDraft(one,placements).valid).toBe(false);
  expect(checkDraft(config(),placements).valid).toBe(true);
  expect(checkDraft(config(),[...placements,{id:7,kind:'generator',x:-50,y:-180}]).valid).toBe(false);
  expect(checkDraft(config(),placements.map((p,i)=>i===5?{...p,kind:'cannon'}:p)).valid).toBe(false);
  expect(checkDraft(config(),placements.map((p,i)=>i===3?{...p,kind:'mortar'}:p)).valid).toBe(false);
  const {repo}=repository();const before=repo.current.profile.devices;
  repo.purchase('device-objects-1');repo.purchase('device-objects-2');
  expect(repo.current.profile.devices).toEqual(before);
 });
 it('combines repair discounts before rounding without changing recharge, grants or damage',()=>{
  const {repo}=repository();for(const n of added)repo.purchase(n.id);
  const p=repo.current.profile;
  for(const d of p.devices){
   const destroyed={...d,health:0};
   expect(repairCost(destroyed,allIds)).toBeLessThanOrEqual(repairCost(destroyed,oldIds));
   expect(repairCost(destroyed,allIds)).toBeLessThanOrEqual(Math.floor(DEVICE_RULES.definitions[d.kind].cost*.25));
   expect(repairCost({...d,health:DEVICE_RULES.definitions[d.kind].health},allIds)).toBe(0);
   expect(rechargeCost(d,allIds)).toBe(rechargeCost(d,oldIds));
  }
  const barrier=p.devices.find(d=>d.kind==='barrier')!;
  expect(repairCost({...barrier,health:0},allIds)).toBe(Math.floor(12*.25*.75*.85));
  const trap=p.devices.find(d=>d.kind==='light-trap')!,before=p.resources,charge=trap.trapCharges;
  const bill=repairCost(trap,allIds);repo.repairDevice(trap.id);repo.repairDevice(trap.id);
  expect(repo.current.profile.resources).toBe(before-bill);
  expect(repo.current.profile.devices.find(d=>d.id===trap.id)!.trapCharges).toBe(charge);
  expect(decodeSave(JSON.stringify(repo.current))).toEqual(repo.current);
 });
 it('buys the first repair rank from earned income without raising victory payouts',()=>{
  const save=prior();save.profile.resources=0;const {repo}=repository(save);
  const night=NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config;
  const before=measureBattle(calculateNightConfig(night,oldIds),42);
  const after=measureBattle(calculateNightConfig(night,allIds),42);
  expect(before.outcome).toBe('victory');expect(after.outcome).toBe('victory');expect(after.reward).toBe(before.reward);
  repo.begin({id:'stage10-income',nightId:'far-shore',seed:42,placementCost:0,lensId:'basic'});
  repo.settle('stage10-income','victory',before.reward,before.encountered);
  repo.purchase('engineering-repair-1');
  const reserve=repo.current.profile.devices.reduce((s,d)=>s+repairCost({...d,health:0},repo.current.profile.purchasedUpgrades),0);
  expect(repo.current.profile.resources).toBeGreaterThanOrEqual(reserve);
  console.log(JSON.stringify({reward:before.reward,remaining:repo.current.profile.resources,reserve}));
 });
});


describe('stage 10 persistent service',()=>{
 it.each(['before','after'] as const)('charges discounted repair once across a %s-write failure, keeping rearm separate',failure=>{
  const {repo,store}=repository();for(const n of added)repo.purchase(n.id);
  const p=repo.current.profile,trap=p.devices.find(d=>d.kind==='light-trap')!;
  const bill=repairCost(trap,p.purchasedUpgrades),rearm=rechargeCost(trap,p.purchasedUpgrades);
  store.fail=failure;
  if(failure==='before'){expect(()=>repo.repairDevice(trap.id)).toThrow();expect(repo.current.profile).toEqual(p);}
  else repo.repairDevice(trap.id);
  store.fail=undefined;repo.repairDevice(trap.id);repo.repairDevice(trap.id);repo.load();
  expect(repo.current.profile.resources).toBe(p.resources-bill);
  expect(repo.current.profile.devices.find(d=>d.id===trap.id)!.trapCharges).toBe(1);
  repo.rechargeDevice(trap.id);repo.rechargeDevice(trap.id);repo.load();
  expect(repo.current.profile.resources).toBe(p.resources-bill-rearm);
  expect(repo.current.profile.devices.find(d=>d.id===trap.id)!.trapCharges).toBe(2);
 });
 it('pays for extra bodies and preserves six placements through a real night and reload',()=>{
  const {repo}=repository(),start=repo.current.profile.resources;
  repo.purchase('device-objects-1');repo.purchase('device-objects-2');
  repo.purchaseDevice('cannon',repo.current.profile.nextDeviceId);
  repo.purchaseDevice('barrier',repo.current.profile.nextDeviceId);
  expect(repo.current.profile.resources).toBe(start-125-175-20-12);
  const p=repo.current.profile;
  const coords=[[-100,-100],[-100,100],[-200,-100],[-200,100],[-150,0],[-50,180]];
  const bodies=[...p.devices.filter(d=>d.kind==='cannon'),...p.devices.filter(d=>d.kind==='barrier'),
   p.devices.find(d=>d.kind==='generator')!,p.devices.find(d=>d.kind==='harpoon')!];
  const placements=bodies.map((d,i)=>({id:d.id,kind:d.kind,x:coords[i]![0]!,y:coords[i]![1]!}));
  const base=NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config;
  const c=calculateNightConfig(base,p.purchasedUpgrades);
  repo.savePlacements(placements,c);repo.load();
  const snapshot=deviceDeployments(repo.current.profile);
  expect(snapshot).toHaveLength(6);
  repo.begin({id:'stage10-six',nightId:'far-shore',seed:42,placementCost:0,lensId:'basic'});
  const result=measureBattle(c,42,battleDeviceDeployments(repo.current.profile,c.devices.definitions));
  expect(result.outcome).toBe('victory');
  repo.settle('stage10-six','victory',result.reward,result.encountered,normalizedDeviceResults(result.devices,snapshot,c.devices.definitions));
  repo.load();expect(deviceDeployments(repo.current.profile).map(({id,kind,x,y})=>({id,kind,x,y}))).toEqual(snapshot.map(({id,kind,x,y})=>({id,kind,x,y})));
  console.log(JSON.stringify({sixDeviceReward:result.reward,repair:repo.current.profile.devices.reduce((sum,d)=>sum+repairCost(d,p.purchasedUpgrades),0)}));
 });
});
