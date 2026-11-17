import { describe, it, expect } from 'vitest';
import type { SaveStore, EnemyState } from '../../src/contracts';
import { emptySave, decodeSave, SaveRepository } from '../../src/application/saves';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { calculateNightConfig, getUpgradeAvailability, validateUpgradeDefinitions, createUpgradeViews } from '../../src/progression/upgrades';
import { repairCost, rechargeCost } from '../../src/progression/devices';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { translate } from '../../src/presentation/shared/localization';
import { grantFixtureDevices } from '../helpers/devices';
const old = UPGRADES.slice(0,82), added = UPGRADES.slice(82);
const oldIds = old.map(n=>n.id), allIds = UPGRADES.map(n=>n.id);
function prior() {
 const save=emptySave(); Object.assign(save.profile,{ resources:2000, purchasedUpgrades:oldIds,
 wonNightIds:NIGHT_CATALOG.map(n=>n.id), unlockedLenses:LENSES.map(n=>n.id), lensUpgrades:LENS_UPGRADES.map(n=>n.id), bossMaterials:59, bossLevel:2, completedNights:6 });
 grantFixtureDevices(save.profile);
 const trap=save.profile.devices.find(d=>d.kind==='light-trap')!; trap.health=15.25; trap.trapCharges=1;
 return save;
}
function repository(save=prior()) {
 const store: SaveStore & {raw:string; fail?:'before'|'after'}={raw:JSON.stringify(save), read(){return this.raw;}, write(raw){if(this.fail==='before')throw Error('quota');this.raw=raw;if(this.fail==='after')throw Error('reply');}};
 const repo=new SaveRepository(store);repo.load();return {repo,store};
}
describe('stage 8 general progression',()=>{
 it('adds twelve gated nodes without replacing old purchases and preserves v6',()=>{
  expect(added).toHaveLength(12); expect(UPGRADES.length+LENS_UPGRADES.length+LENSES.length-1).toBe(134);
  expect(()=>validateUpgradeDefinitions(UPGRADES)).not.toThrow();
  expect(added.reduce((s,n)=>s+n.cost,0)).toBe(1340);
  expect(old.reduce((s,n)=>s+n.cost,0)+LENS_UPGRADES.reduce((s,n)=>s+n.cost,0)).toBe(8945);
  const before=prior();expect(decodeSave(JSON.stringify(before))).toEqual(before);
  expect(repository(before).repo.current.profile.purchasedUpgrades).toEqual(oldIds);
 });
 it.each(added)('$id respects dependencies, victory gates, funds and RU/EN previews',node=>{
  const profile=prior().profile;
  profile.purchasedUpgrades=UPGRADES.slice(0,UPGRADES.indexOf(node)).map(n=>n.id);
  profile.wonNightIds=profile.wonNightIds.filter(id=>id!==node.requiresNight);
  expect(getUpgradeAvailability(profile,node.id).status).toBe('requires');
  profile.wonNightIds=NIGHT_CATALOG.map(n=>n.id);
  profile.resources=node.cost-1;
  expect(getUpgradeAvailability(profile,node.id).status).toBe('insufficient');
  profile.resources=node.cost;
  expect(getUpgradeAvailability(profile,node.id).status).toBe('available');
  // Validate the view with a genuine topological prefix, not an impossible descendant-owned profile.
  profile.purchasedUpgrades=UPGRADES.slice(0,UPGRADES.indexOf(node)).map(n=>n.id);
  const view=createUpgradeViews(profile,NIGHT_CONFIG).find(v=>v.definition.id===node.id)!;
  expect(view.nextValue-view.currentValue).toBeCloseTo(node.effect.stat.endsWith('Reduction')?-node.effect.amount:node.effect.amount);
  expect(translate(node.name,'en')).not.toMatch(/[А-Яа-яЁё]/);
  profile.purchasedUpgrades=[];
  expect(getUpgradeAvailability(profile,node.id).status).toBe('requires');
 });
 it.each(['before','after'] as const)('persists once after %s-write failure without healing or refilling inventory',failure=>{
  const {repo,store}=repository(), before=repo.current;
  for(const node of added){
   const snapshot=repo.current;store.fail=failure;
   if(failure==='before'){expect(()=>repo.purchase(node.id)).toThrow();expect(repo.current).toEqual(snapshot);}
   else repo.purchase(node.id);
   store.fail=undefined;repo.purchase(node.id);repo.purchase(node.id);repo.load();
  }
  expect(repo.current.profile).toEqual({...before.profile,resources:660,purchasedUpgrades:allIds});
  const oldBills=before.profile.devices.map(d=>[repairCost(d,oldIds),rechargeCost(d,oldIds)]);
  expect(repo.current.profile.devices.map(d=>[repairCost(d,allIds),rechargeCost(d,allIds)])).toEqual(oldBills);
 });
 it('limits aggregate power while preserving device damage and lens specialization',()=>{
  const before=calculateNightConfig(NIGHT_CONFIG,oldIds), next=calculateNightConfig(NIGHT_CONFIG,allIds);
  expect(next.beam.damagePerSecond).toBe(50);expect(next.beam.damagePerSecond/before.beam.damagePerSecond).toBeLessThan(1.2);
  expect(next.beam.halfAngle*360/Math.PI).toBeCloseTo(44);expect(next.beam.range).toBe(365);
  expect(next.beam.turnSpeed*180/Math.PI).toBeCloseTo(105);expect(next.lighthouseHealth).toBe(200);
  expect(next.shield).toEqual({...before.shield,capacityPerGenerator:125,regenerationPerSecond:20});
  expect(next.flash).toEqual({...before.flash,damage:34,cooldown:15});
  expect(next.devices).toEqual(before.devices);expect(next.pairedDamageBonus).toBe(.25);
  for(const lens of LENSES){
   const loadout={lensId:lens.id,upgrades:LENS_UPGRADES.map(n=>n.id)};
   const a=calculateNightConfig(NIGHT_CONFIG,oldIds,false,loadout), b=calculateNightConfig(NIGHT_CONFIG,allIds,false,loadout);
   expect(b.beam.damagePerSecond-a.beam.damagePerSecond).toBeCloseTo(8*lens.damageMultiplier);
   expect(b.lens).toEqual(a.lens);expect(b.beam.maxTargets).toBe(a.beam.maxTargets);
  }
 });
 it.each([1,2])('applies new damage and linked bonus to %s real selected targets',count=>{
  const config=calculateNightConfig(NIGHT_CONFIG,allIds);
  config.waves=[{id:'new',enemies:['ghost'],spawnInterval:100}];config.enemies.ghost.speed=0;
  const state=createBattle(config,42);state.waves[0]!.spawned=1;
  state.beamAngle=state.desiredBeamAngle=0;
  state.enemies=Array.from({length:count},(_,i):EnemyState=>({id:i+1,kind:'ghost',x:180,y:i===0?-25:25,health:100,armor:0,waveIndex:0,attackCooldown:0}));
  stepBattle(state,config,[]);
  expect(state.litEnemyIds).toHaveLength(count);
  for(const e of state.enemies)expect(e.health).toBeCloseTo(100-50*(count===2?1.25:1)*config.stepSeconds);
 });
 it('keeps late purchases within three guaranteed victory bonuses plus a full repair reserve',()=>{
  const {repo}=repository();const p=repo.current.profile;
  const reserve=p.devices.reduce((s,d)=>s+repairCost({...d,health:0},oldIds),0);
  const reward=NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config.victoryReward;
  // Conservative budget: no kills, early waves or boss materials counted.
  for(const node of added)expect(node.cost+reserve).toBeLessThanOrEqual(3*reward);
  expect(repo.current.profile.bossMaterials).toBe(59);
 });
});
