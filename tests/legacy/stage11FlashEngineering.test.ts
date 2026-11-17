import { fireCannons } from '../../src/simulation/devices';
import { describe, it, expect } from 'vitest';
import type { SaveStore, EnemyState } from '../../src/contracts';
import { emptySave, decodeSave, SaveRepository } from '../../src/application/saves';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { DEVICE_RULES } from '../../src/content/devices';
import { calculateNightConfig, getUpgradeAvailability, createUpgradeViews, validateUpgradeDefinitions } from '../../src/progression/upgrades';
import { deviceDeployments, battleDeviceDeployments, normalizedDeviceResults, repairCost, rechargeCost } from '../../src/progression/devices';
import { createBattle } from '../../src/simulation/battle';
import { useFlash } from '../../src/simulation/abilities';
import { checkDraft } from '../../src/application/placement';
import { translate } from '../../src/presentation/shared/localization';
import { upgradeExplanation, upgradeValue } from '../../src/presentation/screens';
import { grantFixtureDevices } from '../helpers/devices';
import { measureBattle } from '../helpers/balancePolicy';

const old=UPGRADES.slice(0,122), added=UPGRADES.slice(122);
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
describe('stage 11 purchases and compatibility',()=>{
 it('appends thirteen nodes, preserves v6 and previous totals',()=>{
  expect(added).toHaveLength(13);expect(UPGRADES.length+LENS_UPGRADES.length+LENSES.length-1).toBe(175);
  expect(added.reduce((s,n)=>s+n.cost,0)).toBe(2265);
  expect(old.reduce((s,n)=>s+n.cost,0)+LENS_UPGRADES.reduce((s,n)=>s+n.cost,0)).toBe(14610);
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
  expect(translate(node.name+' '+upgradeValue(node.effect.stat,view.nextValue)+' '+upgradeExplanation(node.effect.stat),'en')).not.toMatch(/[А-Яа-яЁё]/);
  p.purchasedUpgrades=[];expect(getUpgradeAvailability(p,node.id).status).toBe('requires');
 });
 it.each(['before','after'] as const)('survives %s-write failure once without healing or recharging',failure=>{
  const {repo,store}=repository(),before=repo.current.profile;
  for(const node of added){
   const snapshot=repo.current;store.fail=failure;
   if(failure==='before'){expect(()=>repo.purchase(node.id)).toThrow();expect(repo.current).toEqual(snapshot);}else repo.purchase(node.id);
   store.fail=undefined;repo.purchase(node.id);repo.purchase(node.id);repo.load();
  }
  expect(repo.current.profile).toEqual({...before,resources:735,purchasedUpgrades:allIds});
 });
});

describe('stage 11 special flash and targeting',()=>{
 it('adds only the intended stats and keeps damage, income, repair and beam rules',()=>{
  const a=config(false),b=config();
  expect(b.flash).toEqual({...a.flash,radius:255,stunDuration:expect.closeTo(2.6),reloadAssist:.5,damagedArmorBonus:.25});
  expect(b.beam).toEqual(a.beam);expect(b.shield).toEqual(a.shield);expect(b.victoryReward).toBe(a.victoryReward);
  expect(b.devices.maxObjects).toBe(8);expect(b.devices.typeSlots).toBe(a.devices.typeSlots);
  expect(b.devices.cannon.manualDamageBonus).toBeCloseTo(.35);
  for(const d of prior().profile.devices){
   expect(b.devices.definitions[d.kind].health-a.devices.definitions[d.kind].health).toBeCloseTo(DEVICE_RULES.definitions[d.kind].health*.15);
   expect(repairCost(d,allIds)).toBe(repairCost(d,oldIds));
  }
 });
 it('only boosts previously damaged remaining armor and preserves overflow damage',()=>{
  const c=config();const s=createBattle(c,42);
  s.enemies=[enemy(1,100,'turtle',68),enemy(2,100,'turtle',60),enemy(3,100,'turtle',30),enemy(4,100,'turtle',0),enemy(5,100)];
  useFlash(s,c);
  expect(s.enemies.map(e=>e.armor)).toEqual([22,2.5,0,0,0]);
  expect(s.enemies.map(e=>e.health)).toEqual([1000,1000,978,954,954]);
  expect(s.enemies[0]!.stunnedUntilTick).toBe(78);
  const baseline=createBattle(config(false),42);baseline.enemies=[enemy(1,250)];
  useFlash(baseline,config(false)); // Boundary includes silhouettes, so test the old cutoff further out.
  const inside=createBattle(c,42);inside.enemies=[enemy(1,265),enemy(2,280)];
  const outsideOld=createBattle(config(false),42);outsideOld.enemies=[enemy(1,265)];
  useFlash(inside,c);useFlash(outsideOld,config(false));
  expect(inside.enemies[0]!.health).toBe(954);expect(outsideOld.enemies[0]!.health).toBe(1000);
  expect(inside.enemies[1]!.health).toBe(1000);
 });
 it('advances only live guns inside the flash once and never heals or supplies ammunition',()=>{
  const c=config();const kinds=['cannon','harpoon','mortar','bell','repair-lamp','light-trap','cannon','cannon'] as const;
  const placements=kinds.map((kind,i)=>({id:i+1,kind,x:i===6?300:100,y:0}));
  const s=createBattle(c,42,undefined,placements);
  for(const d of s.devices)d.attackCooldown=1;
  s.devices[2]!.attackCooldown=.2;s.devices[7]!.health=0;
  const before=s.devices.map(d=>({health:d.health,charges:d.trapCharges,repair:d.repairCharges}));
  useFlash(s,c);expect(s.devices.map(d=>d.attackCooldown)).toEqual([.5,.5,0,1,1,1,1,1]);
  expect(s.devices.map(d=>({health:d.health,charges:d.trapCharges,repair:d.repairCharges}))).toEqual(before);
  useFlash(s,c);expect(s.devices[0]!.attackCooldown).toBe(.5);
  const disabled=structuredClone(c);disabled.flash.enabled=false;
  const d=createBattle(disabled,42,undefined,placements);d.devices[0]!.attackCooldown=1;
  useFlash(d,disabled);expect(d.devices[0]!.attackCooldown).toBe(1);
 });
 it('keeps the strengthened manual bonus once per target and shares it across boss zones',()=>{
  const c=config();const s=createBattle(c,42,undefined,[{id:1,kind:'cannon',x:100,y:0}]);
  s.enemies=[enemy(1,150)];s.devices[0]!.targetId=1;
  fireCannons(s,c);expect(s.enemies[0]!.health).toBeCloseTo(1000-24*1.35);
  s.devices[0]!.targetId=null;s.devices[0]!.attackCooldown=0;fireCannons(s,c);
  s.devices[0]!.targetId=1;s.devices[0]!.attackCooldown=0;fireCannons(s,c);
  expect(s.enemies[0]!.health).toBeCloseTo(1000-24*1.35-48);
  const bossConfig=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id==='abyss-warden')!.config,allIds);
  const b=createBattle(bossConfig,42,undefined,[{id:1,kind:'cannon',x:100,y:0}]);
  for(const zone of b.boss!.tentacles){zone.x=150;zone.y=0;}
  const hp=b.boss!.health;
  b.devices[0]!.targetId=b.boss!.tentacles[0]!.id;fireCannons(b,bossConfig);
  b.devices[0]!.targetId=b.boss!.tentacles[1]!.id;b.devices[0]!.attackCooldown=0;fireCannons(b,bossConfig);
  expect(b.boss!.health).toBeCloseTo(hp-24*1.35-24);
  const remaining=b.boss!.health;useFlash(b,bossConfig);
  expect(b.boss!.health).toBe(remaining-46);
 });
});
describe('stage 11 condition, recharge and economy',()=>{
 it('preserves fractional hull condition and damage on roundtrip with all three hull ranks',()=>{
  const p=prior().profile,c=config();p.devices[0]!.health=0;
  for(const d of p.devices){d.position={x:-150,y:0};}
  const snapshot=deviceDeployments(p),deployed=battleDeviceDeployments(p,c.devices.definitions);
  for(const d of deployed){
   const owned=p.devices.find(x=>x.id===d.id)!;
   expect(d.health/c.devices.definitions[d.kind].health).toBeCloseTo(owned.health/DEVICE_RULES.definitions[d.kind].health);
  }
  expect(normalizedDeviceResults(deployed,snapshot,c.devices.definitions)).toEqual(snapshot);
  const live=deployed.find(d=>d.health>0)!;live.health-=1;
  const normalized=normalizedDeviceResults(deployed,snapshot,c.devices.definitions);
  expect(normalized.find(d=>d.id===live.id)!.health).toBeCloseTo(snapshot.find(d=>d.id===live.id)!.health-DEVICE_RULES.definitions[live.kind].health/c.devices.definitions[live.kind].health);
  expect(normalized[0]!.health).toBe(0);
 });
 it.each([0,1,2])('prices %s remaining trap charges without granting new ones',remaining=>{
  const trap=prior().profile.devices.find(d=>d.kind==='light-trap')!;
  const d={...trap,trapCharges:remaining,consumed:remaining===0};
  expect(rechargeCost(d,oldIds)).toBe([4,2,0][remaining]);
  expect(rechargeCost(d,[...oldIds,'engineering-recharge-1'])).toBe([3,2,0][remaining]);
  expect(rechargeCost(d,allIds)).toBe([2,1,0][remaining]);
 });
 it.each(['before','after'] as const)('keeps discounted recharge atomic after %s-write failure and separate from repairs',failure=>{
  const {repo,store}=repository();for(const n of added)repo.purchase(n.id);
  const p=repo.current.profile,trap=p.devices.find(d=>d.kind==='light-trap')!;
  const bill=rechargeCost(trap,p.purchasedUpgrades);expect(bill).toBe(1);
  store.fail=failure;
  if(failure==='before'){expect(()=>repo.rechargeDevice(trap.id)).toThrow();expect(repo.current.profile).toEqual(p);}else repo.rechargeDevice(trap.id);
  store.fail=undefined;repo.rechargeDevice(trap.id);repo.rechargeDevice(trap.id);repo.load();
  expect(repo.current.profile.resources).toBe(p.resources-1);
  const reloaded=repo.current.profile.devices.find(d=>d.id===trap.id)!;
  expect(reloaded.health).toBe(trap.health);expect(reloaded.trapCharges).toBe(2);
  const repair=repairCost(reloaded,p.purchasedUpgrades);repo.repairDevice(trap.id);repo.repairDevice(trap.id);
  expect(repo.current.profile.resources).toBe(p.resources-1-repair);
 });
 it('buys extra bodies, runs eight placements and preserves normalized condition and charges',()=>{
  const {repo}=repository();for(const n of added)repo.purchase(n.id);
  const start=repo.current.profile.resources;
  for(const kind of ['cannon','barrier','generator','light-trap'] as const)repo.purchaseDevice(kind,repo.current.profile.nextDeviceId);
  expect(repo.current.profile.resources).toBe(start-20-12-28-16);
  const p=repo.current.profile,chosen=p.devices.filter(d=>['cannon','barrier','generator','light-trap'].includes(d.kind));
  const coords=[[-80,-80],[-80,80],[-170,-80],[-170,80],[-250,-80],[-250,80],[-80,-210],[-80,210]];
  const placements=chosen.map((d,i)=>({id:d.id,kind:d.kind,x:coords[i]![0]!,y:coords[i]![1]!}));
  const c=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config,p.purchasedUpgrades);
  const seven=calculateNightConfig(NIGHT_CONFIG,[...oldIds,'device-objects-3']);
  expect(checkDraft(seven,placements.slice(0,7)).valid).toBe(true);expect(checkDraft(seven,placements).valid).toBe(false);
  expect(checkDraft(c,placements).valid).toBe(true);
  expect(checkDraft(c,[...placements,{id:99,kind:'mortar',x:-180,y:180}]).valid).toBe(false);
  repo.savePlacements(placements,c);const snapshot=deviceDeployments(repo.current.profile);
  repo.begin({id:'stage11-eight',nightId:'far-shore',seed:42,placementCost:0,lensId:'basic'});
  const result=measureBattle(c,42,battleDeviceDeployments(repo.current.profile,c.devices.definitions));
  expect(result.outcome).toBe('victory');
  const normalized=normalizedDeviceResults(result.devices,snapshot,c.devices.definitions);
  repo.settle('stage11-eight','victory',result.reward,result.encountered,normalized);repo.load();
  expect(deviceDeployments(repo.current.profile)).toEqual(normalized);
  for(const d of normalized.filter(d=>d.kind==='light-trap'))expect(d.trapCharges).toBeLessThanOrEqual(snapshot.find(x=>x.id===d.id)!.trapCharges!);
  const reserve=repo.current.profile.devices.reduce((sum,d)=>sum+repairCost({...d,health:0},p.purchasedUpgrades),0);
  console.log(JSON.stringify({eightReward:result.reward,resources:repo.current.profile.resources,reserve}));
 });
 it('earns the price of the first recharge node from one real repeat victory with repair reserve',()=>{
  const save=prior();save.profile.resources=0;const {repo}=repository(save);
  const base=NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config;
  const a=measureBattle(calculateNightConfig(base,oldIds),42),b=measureBattle(calculateNightConfig(base,allIds),42);
  expect(a.outcome).toBe('victory');expect(b.outcome).toBe('victory');expect(b.reward).toBe(a.reward);
  repo.begin({id:'stage11-income',nightId:'far-shore',seed:42,placementCost:0,lensId:'basic'});
  repo.settle('stage11-income','victory',a.reward,a.encountered);repo.purchase('engineering-recharge-1');
  const reserve=repo.current.profile.devices.reduce((sum,d)=>sum+repairCost({...d,health:0},repo.current.profile.purchasedUpgrades),0);
  expect(repo.current.profile.resources).toBeGreaterThanOrEqual(reserve);
  console.log(JSON.stringify({reward:a.reward,remaining:repo.current.profile.resources,reserve}));
 });
});
