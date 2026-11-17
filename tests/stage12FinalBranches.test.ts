import { damageLighthouse, healLighthouseAfterWave } from '../src/simulation/lighthouse';
import { updateMortars } from '../src/simulation/mortar';
import { attackTentacles } from '../src/simulation/boss';
import { updateShield, hitShield, delayShieldRecovery, isProtected } from '../src/simulation/shield';
import { damageDevice } from '../src/simulation/deviceDamage';
import { fireCannons } from '../src/simulation/devices';
import { describe, it, expect } from 'vitest';
import type { SaveStore, EnemyState } from '../src/contracts';
import { emptySave, decodeSave, SaveRepository } from '../src/application/saves';
import { UPGRADES } from '../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../src/content/lenses';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG } from '../src/content/nights';
import { DEVICE_RULES } from '../src/content/devices';
import { calculateNightConfig, getUpgradeAvailability, createUpgradeViews, validateUpgradeDefinitions } from '../src/progression/upgrades';
import { deviceDeployments, battleDeviceDeployments, normalizedDeviceResults, repairCost, rechargeCost } from '../src/progression/devices';
import { createBattle, stepBattle } from '../src/simulation/battle';


import { translate } from '../src/presentation/shared/localization';
import { upgradeExplanation, upgradeValue } from '../src/presentation/screens';
import { grantFixtureDevices } from './helpers/devices';
import { measureBattle } from './helpers/balancePolicy';

const old=UPGRADES.slice(0,135), added=UPGRADES.slice(135);
const oldIds=old.map(n=>n.id), allIds=UPGRADES.map(n=>n.id);
function prior(){
 const save=emptySave();Object.assign(save.profile,{resources:6000,bossMaterials:59,bossLevel:2,completedNights:6,
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
describe('stage 12 purchases and compatibility',()=>{
 it('appends twenty-five nodes, preserves v6 and previous totals',()=>{
  expect(added).toHaveLength(25);expect(UPGRADES.length+LENS_UPGRADES.length+LENSES.length-1).toBe(200);
  expect(added.reduce((s,n)=>s+n.cost,0)).toBe(4640);
  expect(old.reduce((s,n)=>s+n.cost,0)+LENS_UPGRADES.reduce((s,n)=>s+n.cost,0)).toBe(16875);
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
  expect(view.nextValue-view.currentValue).toBeCloseTo(node.effect.amount*(node.effect.stat==='shieldDelayReduction'?-1:1));
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
  expect(repo.current.profile).toEqual({...before,resources:1360,purchasedUpgrades:allIds});
 });
});


describe('stage 12 combat rules',()=>{
 it('adds only the specified coefficients and leaves previous equipment and prices intact',()=>{
  const a=config(false),b=config();
  expect(b.beam).toEqual(a.beam);expect(b.devices).toEqual(a.devices);expect(b.flash).toEqual(a.flash);
  expect(b.lighthouseHealth).toBe(a.lighthouseHealth);
  expect(b.shield).toEqual({...a.shield,radius:185,regenerationDelay:3.25});
  expect(b.progression).toMatchObject({beamArmorBonus:expect.closeTo(.45),beamExecuteBonus:.1,litDeviceDamageBonus:.1,
   lighthouseDamageReduction:.09,lighthouseHeavyReduction:.1,lighthouseEmergencyReduction:expect.closeTo(.35),lighthouseWaveRepair:6,shieldRestoreReduction:.2});
  for(const d of prior().profile.devices){expect(repairCost(d,allIds)).toBe(repairCost(d,oldIds));expect(rechargeCost(d,allIds)).toBe(rechargeCost(d,oldIds));}
 });
 it('uses additive beam armor with the lens, without multiplying overflow health damage',()=>{
  const c=calculateNightConfig(NIGHT_CONFIG,allIds,false,{lensId:'armor-breaker',upgrades:LENS_UPGRADES.map(n=>n.id)});
  c.waves=[{id:'one',enemies:['turtle'],spawnInterval:100}];c.enemies.turtle.speed=0;
  const s=createBattle(c,42);s.waves[0]!.spawned=1;s.beamAngle=s.desiredBeamAngle=0;
  s.enemies=[enemy(1,180,'turtle',1)];
  stepBattle(s,c,[]);
  expect(s.enemies[0]!.armor).toBe(0);
  expect(s.enemies[0]!.health).toBeCloseTo(1000-(c.beam.damagePerSecond*c.stepSeconds-1/2.95));
 });
 it('finishes only selected low-HP targets, without raising the beam target limit',()=>{
  const c=config();c.waves=[{id:'one',enemies:['ghost','ghost','ghost'],spawnInterval:100}];c.enemies.ghost.speed=0;
  const s=createBattle(c,42);s.waves[0]!.spawned=3;s.beamAngle=s.desiredBeamAngle=0;
  s.enemies=[{...enemy(1,180),y:-20,health:8},{...enemy(2,180),y:20,health:8.5},{...enemy(3,180),y:55,health:8}];
  stepBattle(s,c,[]);expect(s.litEnemyIds).toEqual([1,2]);
  expect(s.enemies[0]!.health).toBeCloseTo(8-58*1.3*1.1/30);
  expect(s.enemies[1]!.health).toBeCloseTo(8.5-58*1.3/30);
  expect(s.enemies[2]!.health).toBe(8);
 });
 it('sums boss beam zones and uses one finisher decision for the entire step',()=>{
  const c=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id==='abyss-warden')!.config,allIds);
  c.boss!.speed=0;const s=createBattle(c,42);
  s.beamAngle=s.desiredBeamAngle=0;s.boss!.health=c.boss!.health*.25-.1;
  s.boss!.tentacles.forEach((z,i)=>{z.x=i<2?180:-500;z.y=i===0?-25:25;});
  const hp=s.boss!.health;stepBattle(s,c,[]);
  expect(s.litTentacleIds).toHaveLength(2);
  expect(s.boss!.health).toBeCloseTo(hp-2*58*1.3*1.1/30);
 });
 it('guides guns only toward currently selected targets; mortar checks again at impact',()=>{
  const c=config(),s=createBattle(c,42,undefined,[{id:1,kind:'cannon',x:100,y:0}]);
  s.enemies=[enemy(1,150)];s.litEnemyIds=[1];fireCannons(s,c);
  expect(s.enemies[0]!.health).toBeCloseTo(1000-24*1.1);
  s.litEnemyIds=[];s.devices[0]!.attackCooldown=0;fireCannons(s,c);
  expect(s.enemies[0]!.health).toBeCloseTo(1000-24*1.1-24);
  const m=createBattle(c,42);m.enemies=[enemy(1,150),enemy(2,160)];m.litEnemyIds=[1];
  m.mortarProjectiles=[{id:1,deviceId:99,fromX:0,fromY:0,x:150,y:0,launchTick:0,impactTick:0,damage:10,blastRadius:30,armorMultiplier:1}];
  updateMortars(m,c);
  expect(m.enemies.map(e=>e.health)).toEqual([989,990]);
 });
 it('applies hull and heavy protection to actual creature and boss attacks',()=>{
  const c=config();c.enemies.minotaur.speed=0;
  const s=createBattle(c,42);s.beamAngle=s.desiredBeamAngle=Math.PI;
  s.enemies=[{...enemy(1,48,'minotaur'),chargePhase:'charging',attackCooldown:0}];
  stepBattle(s,c,[]);expect(s.lighthouseHealth).toBeCloseTo(230-12*.91*.9);
  const bc=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id==='abyss-warden')!.config,allIds),b=createBattle(bc,42);
  b.boss!.tentacles.forEach(z=>{z.x=1000;z.y=0;});b.boss!.tentacles[0]!.x=0;
  attackTentacles(b,bc,new Map());
  expect(b.lighthouseHealth).toBeCloseTo(230-bc.boss!.attackDamage*.91*.9);
 });
 it('triggers emergency protection once, includes its trigger hit and still allows lethal damage',()=>{
  const c=config(),s=createBattle(c,42);s.lighthouseHealth=60;
  damageLighthouse(s,c,10);expect(s.emergencyUsed).toBe(true);
  expect(s.lighthouseHealth).toBeCloseTo(60-10*.91*.65);expect(s.emergencyUntilTick).toBe(60);
  damageLighthouse(s,c,10,true);expect(s.lighthouseHealth).toBeCloseTo(60-10*.91*.65-10*.91*.9*.65);
  s.tick=60;const hp=s.lighthouseHealth;damageLighthouse(s,c,10);
  expect(s.lighthouseHealth).toBeCloseTo(hp-10*.91);expect(s.emergencyUntilTick).toBe(60);
  const fatal=createBattle(c,42);fatal.lighthouseHealth=1;damageLighthouse(fatal,c,1000);
  expect(fatal.lighthouseHealth).toBe(0);healLighthouseAfterWave(fatal,c);expect(fatal.lighthouseHealth).toBe(0);
 });
 it('heals each completed wave exactly once, caps HP, and never revives a defeated lighthouse',()=>{
  const c=config();c.waves=[{id:'a',enemies:['ghost'],spawnInterval:100},{id:'b',enemies:['ghost'],spawnInterval:100}];
  c.waveInterval=1000;const s=createBattle(c,42);
  s.waves[0]!.started=true;s.waves[0]!.spawned=1;s.waves[0]!.defeated=1;s.lighthouseHealth=100;s.enemies=[];
  stepBattle(s,c,[]);expect(s.lighthouseHealth).toBe(106);stepBattle(s,c,[]);expect(s.lighthouseHealth).toBe(106);
  s.lighthouseHealth=229;healLighthouseAfterWave(s,c);expect(s.lighthouseHealth).toBe(230);
  const dead=createBattle(c,42);dead.lighthouseHealth=0;dead.waves[0]!.started=true;dead.waves[0]!.spawned=1;dead.waves[0]!.defeated=1;
  stepBattle(dead,c,[]);expect(dead.lighthouseHealth).toBe(0);expect(dead.outcome).toBe('defeat');
 });
});
describe('stage 12 field and economic boundaries',()=>{
 it('shortens recovery without instant refill, grants one second of protection only on restart',()=>{
  const c=config();const s=createBattle(c,42,undefined,[{id:1,kind:'generator',x:-70,y:0}]);
  expect(s.shield.guardUntilTick).toBeUndefined();s.shield.current=0;delayShieldRecovery(s,c);
  for(let i=0;i<97;i++){updateShield(s,c);s.tick++;}
  expect(s.shield.current).toBe(0);updateShield(s,c);
  expect(s.shield.current).toBeCloseTo(23/30);expect(s.shield.guardUntilTick).toBe(s.tick+30);
  s.shield.current=100;hitShield(s,c,10,0,0);expect(s.shield.current).toBe(92);
  s.tick=s.shield.guardUntilTick!;hitShield(s,c,10,0,0);expect(s.shield.current).toBe(82);
 });
 it('keeps generator count from multiplying regeneration and requires a live generator',()=>{
  const c=config();const placements=[{id:1,kind:'generator' as const,x:-70,y:0},{id:2,kind:'generator' as const,x:-110,y:0}];
  const one=createBattle(c,42,undefined,placements.slice(0,1)),two=createBattle(c,42,undefined,placements);
  one.shield.current=two.shield.current=0;updateShield(one,c);updateShield(two,c);
  expect(two.shield.current).toBe(one.shield.current);expect(two.shield.maximum).toBe(one.shield.maximum*2);
  for(const d of two.devices){d.health=0;d.residualUntilTick=90;}two.shield.current=0;
  updateShield(two,c);expect(two.shield.maximum).toBe(290);expect(two.shield.current).toBe(0);
 });
 it('uses the larger radius for whole-hull protection and delays recovery on protected hull damage',()=>{
  const c=config();const s=createBattle(c,42,undefined,[{id:1,kind:'generator',x:-70,y:0},{id:2,kind:'cannon',x:-169,y:0}]);
  const d=s.devices[1]!;expect(isProtected(d,c)).toBe(true);expect(isProtected(d,config(false))).toBe(false);
  d.x=-170;expect(isProtected(d,c)).toBe(false);d.x=-169;
  s.shield.current=0;s.shield.recoveryRemaining=.1;damageDevice(s,c,d,1);
  expect(s.shield.recoveryRemaining).toBe(3.25);
 });
 it('keeps old profiles unchanged on reload and previous repair and recharge costs with new ranks',()=>{
  const p=prior().profile;const c=config();
  for(const d of p.devices)d.position={x:-150,y:0};
  const snapshot=deviceDeployments(p),deployed=battleDeviceDeployments(p,c.devices.definitions);
  expect(normalizedDeviceResults(deployed,snapshot,c.devices.definitions)).toEqual(snapshot);
  expect(c.devices.definitions).toEqual(config(false).devices.definitions);
  expect(DEVICE_RULES.definitions.cannon.cost).toBe(20);
  expect(repository().repo.current.profile.devices).toEqual(prior().profile.devices);
 });
 it('purchases the first armor rank from real repeat income without increasing per-victory payouts',()=>{
  const save=prior();save.profile.resources=0;const {repo}=repository(save);
  const base=NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config;
  let income=0;
  for(let i=0;i<2;i++){
   const result=measureBattle(calculateNightConfig(base,oldIds),42);
   expect(result.outcome).toBe('victory');
   repo.begin({id:'stage12-income-'+i,nightId:'far-shore',seed:42,placementCost:0,lensId:'basic'});
   repo.settle('stage12-income-'+i,'victory',result.reward,result.encountered);income+=result.reward;
  }
  repo.purchase('beam-armor-1');
  const reserve=repo.current.profile.devices.reduce((sum,d)=>sum+repairCost({...d,health:0},allIds),0);
  expect(repo.current.profile.resources).toBe(income-150);expect(repo.current.profile.resources).toBeGreaterThanOrEqual(reserve);
  const before=measureBattle(calculateNightConfig(base,oldIds),42),after=measureBattle(calculateNightConfig(base,allIds),42);
  expect(after.outcome).toBe('victory');expect(after.reward).toBe(before.reward);
  console.log(JSON.stringify({income,remaining:repo.current.profile.resources,reserve,reward:after.reward}));
 });
});
