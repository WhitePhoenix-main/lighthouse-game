import { describe, expect, it } from 'vitest';
import type { LateNightMode, NightId } from '../src/contracts';
import { NIGHT_CATALOG } from '../src/content/nights';
import { NIGHT_CONFIG } from '../src/content/night';
import { resolveLateNight, lateNightModeOptions } from '../src/content/lateModes';
import { LighthouseApplication } from '../src/application/gameApplication';
import { SaveRepository, decodeSave } from '../src/application/saves';
import { calculateNightConfig } from '../src/progression/upgrades';
import { deviceDeployments, repairCost, rechargeCost } from '../src/progression/devices';
import { pressureBuild } from './helpers/latePressureBuilds';
import { specs } from './helpers/lateBuilds';
const late: NightId[] = ['armored-front','sky-siege','cross-current'];
function fixture() {
  const save = pressureBuild(specs[0]!, Infinity).save;
  save.profile.wonNightIds = save.profile.wonNightIds.filter(id => !late.includes(id));
  let raw = JSON.stringify(save), writes = 0;
  let fail: 'none' | 'before' | 'after' = 'none';
  const store = { read: () => raw, write: (value: string) => {
    writes++; if(fail === 'before') throw Error('before');
    raw = value; if(fail === 'after') throw Error('after');
  } };
  return {save,store,raw:()=>raw,writes:()=>writes,fail:(value:typeof fail)=>{fail=value;}};
}
function application(f = fixture(), tiny = false) {
  const catalog = structuredClone(NIGHT_CATALOG);
  if(tiny) catalog.find(n=>n.id==='armored-front')!.config.waves=[{id:'mode-check',enemies:['ghost'],spawnInterval:100}];
  let count=0;
  const app=new LighthouseApplication(f.store,NIGHT_CONFIG,()=>({id:'mode-'+ ++count,seed:42}),undefined,catalog);
  app.selectNight('armored-front'); app.openPreparation();
  return {app,f,catalog};
}
function finish(app:LighthouseApplication) {
  for(let i=0;i<1500 && app.view.screen==='battle';i++){
    const e=app.view.battle!.enemies.find(e=>e.health>0);
    if(e)app.command({type:'aim',angle:Math.atan2(e.y,e.x)});
    app.command({type:'flash'});app.advance(100);
  }
  expect(app.view.screen).toBe('result');
}

describe('explicit late night modes',()=>{
 it.each(late)('%s keeps assault rules intact and transition rewards honest',id=>{
  const original=NIGHT_CATALOG.find(n=>n.id===id)!.config, snapshot=structuredClone(original);
  const assault=resolveLateNight(original,'assault'), transition=resolveLateNight(original,'transition');
  expect(assault).toEqual({...original,lateMode:'assault'});
  expect(transition.enemies.minotaur.charge).toEqual(original.enemies.minotaur.charge);
  expect(transition.enemies.minotaur.attackDamage).toBe(original.enemies.minotaur.attackDamage);
  for(const kind of ['ghost','turtle','bat','minotaur'] as const){
    expect(transition.enemies[kind].health).toBe(Math.round(original.enemies[kind].health*.5));
    expect(transition.enemies[kind].armor).toBe(Math.round(original.enemies[kind].armor*.5));
    expect(transition.enemies[kind].reward).toBe(original.enemies[kind].reward);
  }
  expect(transition.waves).toEqual(original.waves);
  expect(transition.devices).toEqual(original.devices);
  expect(transition.shield).toEqual(original.shield);
  const gross=(c:typeof original)=>c.victoryReward+c.waves.reduce((s,w)=>s+w.enemies.reduce((t,k)=>t+c.enemies[k].reward,0),0);
  expect(gross(transition)).toBe(190);expect(gross(assault)).toBe(260);
  expect(lateNightModeOptions(original).map(o=>o.totalReward)).toEqual([gross(transition),gross(assault)]);
  transition.enemies.ghost.health=1;
  expect(original).toEqual(snapshot);expect(assault.enemies.ghost.health).toBe(original.enemies.ghost.health);
 });
 it('leaves early nights unchanged and does not offer mode controls there',()=>{
  for(const n of NIGHT_CATALOG.filter(n=>!late.includes(n.id))) {
    expect(resolveLateNight(n.config,'transition')).toEqual(n.config);
    expect(resolveLateNight(n.config,'assault')).toEqual(n.config);
    expect(lateNightModeOptions(n.config)).toEqual([]);
  }
 });
 it('switching changes preview but never inventory, repair bills, charges or progress',()=>{
  const f=fixture();
  const repo=new SaveRepository(f.store);repo.load();
  const injured=repo.current;
  injured.profile.devices.forEach((d,i)=>{d.health*=i%2?.5:0;if(d.kind==='light-trap'){d.trapCharges=0;d.consumed=true;}});
  f.store.write(JSON.stringify(injured));
  const {app}=application(f);
  const before=structuredClone(app.view.profile),raw=f.raw(),writes=f.writes();
  const bills=()=>app.view.profile.devices.map(d=>[repairCost(d,app.view.profile.purchasedUpgrades),rechargeCost(d,app.view.profile.purchasedUpgrades)]);
  const oldBills=bills();
  expect(app.view.config.lateMode).toBe('transition');
  app.selectLateMode('assault');expect(app.view.config.lateMode).toBe('assault');
  app.selectLateMode('transition');app.selectLateMode('bad' as LateNightMode);
  expect(app.view.config.lateMode).toBe('transition');
  expect(app.view.profile).toEqual(before);expect(bills()).toEqual(oldBills);
  expect(f.raw()).toBe(raw);expect(f.writes()).toBe(writes);
 });
 it('pins the pending mode through a failed start, pause and settings',()=>{
  const {app,f}=application();
  const preview=structuredClone(app.view.config);
  f.fail('before');app.start();expect(app.view.error).not.toBeNull();
  app.selectLateMode('assault');expect(app.view.config).toEqual(preview);
  f.fail('none');app.retrySave();
  expect(app.view.screen).toBe('battle');
  expect(app.view.config).toEqual(preview);
  expect(decodeSave(f.raw()).activeAttempt!.lateMode).toBe('transition');
  app.pause();app.selectLateMode('assault');app.openSettings();app.selectLateMode('assault');
  expect(app.view.config.lateMode).toBe('transition');
 });
 it.each(['transition','assault'] as LateNightMode[])('%s preview, battle and reward agree; result cannot change mode',mode=>{
  const {app,f,catalog}=application(fixture(),true);
  app.selectLateMode(mode);
  const p=app.view.profile;
  const expected=calculateNightConfig(resolveLateNight(catalog.find(n=>n.id==='armored-front')!.config,mode),
    p.purchasedUpgrades,p.legacyEquipment,{lensId:p.selectedLensId,upgrades:p.lensUpgrades});
  expect(app.view.config).toEqual(expected);
  const before=p.resources, pearls=p.bossMaterials;
  app.start();expect(app.view.config).toEqual(expected);
  app.selectLateMode(mode==='transition'?'assault':'transition');expect(app.view.config.lateMode).toBe(mode);
  finish(app);
  expect(app.view.result!.outcome).toBe('victory');
  expect(app.view.result!.lateMode).toBe(mode);
  expect(app.view.result!.victoryReward).toBe(expected.victoryReward);
  const total=expected.enemies.ghost.reward+expected.victoryReward;
  expect(app.view.profile.resources).toBe(before+total);
  expect(app.view.profile.bossMaterials).toBe(pearls);
  expect(app.view.profile.wonNightIds.filter(id=>id==='armored-front')).toHaveLength(1);
  app.selectLateMode(mode==='transition'?'assault':'transition');expect(app.view.result!.lateMode).toBe(mode);
  app.retrySave();expect(decodeSave(f.raw()).profile.resources).toBe(before+total);
 });
 it.each(['before','after'] as const)('settles transition victory once after a write failure %s commit',failure=>{
  const {app,f}=application(fixture(),true);const before=app.view.profile.resources;
  app.start();f.fail(failure);finish(app);
  app.selectLateMode('assault');
  expect(app.view.result!.lateMode).toBe('transition');
  if(failure==='before')expect(app.view.result!.saved).toBe(false);
  f.fail('none');app.retrySave();app.retrySave();
  expect(app.view.result!.saved).toBe(true);
  expect(decodeSave(f.raw()).profile.resources).toBe(before+190);
  expect(app.view.profile.wonNightIds.filter(id=>id==='armored-front')).toHaveLength(1);
 });
 it.each([undefined,'transition','assault'] as const)('loads and interrupts an old/new active attempt (%s) without loss or rewards',mode=>{
  const f=fixture(),repo=new SaveRepository(f.store);repo.load();
  repo.begin({id:'old-or-new',seed:7,nightId:'armored-front',placementCost:0,lensId:'basic',...(mode?{lateMode:mode}:{})});
  const before=repo.current;
  expect(decodeSave(f.raw())).toEqual(before);
  if(mode===undefined){
    repo.begin({...before.activeAttempt!,lateMode:'assault'});
    expect(repo.current).toEqual(before);
    expect(()=>repo.begin({...before.activeAttempt!,lateMode:'transition'})).toThrow();
  }
  const {app}=application(f);
  expect(app.view.interrupted).toBe(true);
  expect(app.view.profile).toEqual(before.profile);
  expect(decodeSave(f.raw()).lastSettled!.reward).toBe(0);
  expect(decodeSave(f.raw()).activeAttempt).toBeNull();
  expect(app.view.profile.devices).toEqual(before.profile.devices);
 });
 it('retains all existing late victories, purchases and damaged inventory without migration',()=>{
  const f=fixture(),existing=pressureBuild(specs[3]!,Infinity).save;
  existing.profile.devices.forEach((d,i)=>{d.health*=i%2?.37:0;if(d.kind==='light-trap'){d.trapCharges=0;d.consumed=true;}});
  f.store.write(JSON.stringify(existing));
  const before=f.raw(),{app}=application(f);
  app.selectLateMode('assault');app.selectNight('sky-siege');app.selectLateMode('transition');
  expect(app.view.profile).toEqual(existing.profile);
  expect(app.view.nights.filter(n=>late.includes(n.id)).every(n=>n.completed)).toBe(true);
  expect(f.raw()).toBe(before);expect(decodeSave(f.raw())).toEqual(existing);
 });
 it('repeating one night in both modes preserves a single shared completion and pays each attempt once',()=>{
  const {app,f}=application(fixture(),true),before=structuredClone(app.view.profile);
  app.start();finish(app);
  const first=app.view.result!.totalResources;
  app.openPreparation();app.selectLateMode('assault');
  app.start();finish(app);
  const second=app.view.result!.totalResources;
  app.retrySave();app.retrySave();
  expect(app.view.profile.resources).toBe(before.resources+first+second);
  expect(app.view.profile.completedNights).toBe(before.completedNights+2);
  expect(app.view.profile.wonNightIds.filter(id=>id==='armored-front')).toHaveLength(1);
  expect(app.view.profile.purchasedUpgrades).toEqual(before.purchasedUpgrades);
  expect(decodeSave(f.raw()).profile).toEqual(app.view.profile);
 });
 it('rejects invalid modes and modes attached to ordinary nights without writing',()=>{
  const f=fixture(),repo=new SaveRepository(f.store);repo.load();const before=f.raw();
  for(const attempt of [
    {nightId:'first-light' as const,lateMode:'transition' as const},
    {nightId:'armored-front' as const,lateMode:'wrong' as LateNightMode},
  ])expect(()=>repo.begin({id:'invalid',seed:1,placementCost:0,lensId:'basic',...attempt})).toThrow();
  expect(f.raw()).toBe(before);
  expect(deviceDeployments(repo.current.profile)).toEqual(deviceDeployments(f.save.profile));
 });
});
