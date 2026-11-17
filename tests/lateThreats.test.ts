import {describe,it,expect} from 'vitest';
import type {NightId,SaveStore,LensId} from '../src/contracts';
import {NIGHT_CATALOG,NIGHT_IDS,validateNightDefinitions} from '../src/content/nights';
import {NIGHT_CONFIG} from '../src/content/night';
import {ENEMIES} from '../src/content/enemies';
import {LENSES,LENS_UPGRADES} from '../src/content/lenses';
import {UPGRADES} from '../src/content/upgrades';
import {calculateNightConfig} from '../src/progression/upgrades';
import {decodeSave,SaveRepository} from '../src/application/saves';
import {deviceDeployments,battleDeviceDeployments,normalizedDeviceResults,repairCost,rechargeCost} from '../src/progression/devices';
import {build,specs} from './helpers/lateBuilds';
import {auditBattle} from './helpers/balance200Policy';
import {createBattle,stepBattle} from '../src/simulation/battle';
import {translate} from '../src/presentation/shared/localization';
const late:NightId[]=['armored-front','sky-siege','cross-current'];
const old:NightId[]=['first-light','broken-shore','winged-tide','rescue-trial','abyss-warden','far-shore'];
const nodeIds=UPGRADES.map(n=>n.id);
describe('late threats: content and saves',()=>{
 it('preserves earlier nights, all purchases, prices and v6 without granting late victories',()=>{
  expect(NIGHT_IDS).toHaveLength(9);expect(()=>validateNightDefinitions(NIGHT_CATALOG)).not.toThrow();
  for(const id of old)expect(NIGHT_CATALOG.find(n=>n.id===id)!.config.enemies).toEqual(ENEMIES);
  expect(old.map(id=>NIGHT_CATALOG.find(n=>n.id===id)!.config.victoryReward)).toEqual([72,84,96,64,66,108]);
  expect(UPGRADES.length+LENS_UPGRADES.length+LENSES.length-1).toBe(200);
  expect(UPGRADES.reduce((s,n)=>s+n.cost,0)+LENS_UPGRADES.reduce((s,n)=>s+n.cost,0)).toBe(21515);
  const save=build(specs[0]!,5000).save;save.profile.wonNightIds=old;
  expect(decodeSave(JSON.stringify(save))).toEqual(save);
  expect(save.profile.wonNightIds.some(id=>late.includes(id))).toBe(false);
 });
 it.each(late)('%s gates on far shore and retains reaction windows and bounded rewards',id=>{
  const n=NIGHT_CATALOG.find(n=>n.id===id)!;
  expect(n.requires).toBe('far-shore');expect(n.optional).toBe(true);
  expect(n.config.enemies.minotaur.charge!.windup).toBe(5.5);
  expect(n.config.enemies.minotaur.attackDamage).toBe(ENEMIES.minotaur.attackDamage);
  const total=n.config.victoryReward+n.config.waves.reduce((s,w)=>s+w.enemies.reduce((t,k)=>t+n.config.enemies[k].reward,0),0);
  expect(total).toBe(260);
  expect(n.config.waves.reduce((s,w)=>s+w.enemies.length,0)).toBe(48);
  expect(Math.min(...n.config.waves.map(w=>w.spawnInterval))).toBeGreaterThanOrEqual(1.6);
  const charges=n.config.waves.flatMap((w,i)=>w.enemies.flatMap((kind,j)=>kind==='minotaur'?[i*n.config.waveInterval+j*w.spawnInterval]:[]));
  for(let i=1;i<charges.length;i++)expect(charges[i]!-charges[i-1]!).toBeGreaterThanOrEqual(9.5);
  for(const w of n.config.waves)expect(n.config.waveInterval-(w.enemies.length-1)*w.spawnInterval).toBeGreaterThanOrEqual(8.7);
  expect(translate(n.name+' '+n.description+' '+n.chapter,'en')).not.toMatch(/[А-Яа-яЁё]/);
 });
 it('adds visible local variants without replacing the global creature definitions',()=>{
  expect(ENEMIES.turtle.armor).toBe(68);expect(ENEMIES.bat.health).toBe(25);
  expect(NIGHT_CATALOG.find(n=>n.id==='armored-front')!.config.enemies.turtle.armor).toBe(840);
  expect(NIGHT_CATALOG.find(n=>n.id==='sky-siege')!.config.enemies.bat.health).toBe(250);
  expect(NIGHT_CATALOG.find(n=>n.id==='cross-current')!.config.enemies.minotaur.health).toBe(180);
 });
 it.each(['far-shore',...late] as NightId[])('%s reload preserves damaged inventory and interruption grants no rewards',nightId=>{
  const save=build(specs[3]!,Infinity).save;save.profile.wonNightIds=[...old];
  save.profile.devices.forEach((d,i)=>{d.health=i%2?0:d.health*.37;if(d.kind==='light-trap'){d.trapCharges=0;d.consumed=true;}});
  let raw=JSON.stringify(save);const repo=new SaveRepository({read:()=>raw,write:v=>{raw=v;}});repo.load();
  expect(repo.current).toEqual(save);
  const bills=()=>repo.current.profile.devices.map(d=>[repairCost(d,repo.current.profile.purchasedUpgrades),rechargeCost(d,repo.current.profile.purchasedUpgrades)]);
  const before=bills();
  repo.begin({id:'reload-late',seed:7,nightId,placementCost:0,lensId:save.profile.selectedLensId});
  const active=repo.current;repo.load();expect(repo.current).toEqual(active);
  repo.settle('reload-late','interrupted',200,['bat']);repo.settle('reload-late','interrupted',200,['bat']);repo.load();
  expect(repo.current.profile).toEqual(save.profile);expect(bills()).toEqual(before);
  expect(repo.current.activeAttempt).toBeNull();expect(repo.current.lastSettled!.reward).toBe(0);
 });
 it('keeps prerequisite validation and late victory settlement idempotent',()=>{
  const save=build(specs[0]!,Infinity).save;save.profile.wonNightIds=old;
  let raw=JSON.stringify(save);const store:SaveStore={read:()=>raw,write:v=>{raw=v;}};
  const repo=new SaveRepository(store);repo.load();
  const c=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id==='armored-front')!.config,save.profile.purchasedUpgrades,false,{lensId:'basic',upgrades:save.profile.lensUpgrades});
  const snapshot=deviceDeployments(repo.current.profile),before=repo.current.profile;
  repo.begin({id:'late-save',seed:42,nightId:'armored-front',placementCost:0,lensId:'basic'});
  const r=auditBattle(c,42,battleDeviceDeployments(repo.current.profile,c.devices.definitions),{flash:true});
  expect(r.outcome).toBe('victory');
  repo.settle('late-save','victory',r.reward,r.encountered,normalizedDeviceResults(r.devices,snapshot,c.devices.definitions));
  const after=repo.current;repo.settle('late-save','victory',r.reward,r.encountered);repo.load();
  expect(repo.current).toEqual(after);expect(after.profile.bossMaterials).toBe(before.bossMaterials);
  expect(after.profile.wonNightIds).toEqual([...old,'armored-front']);
  expect(after.profile.purchasedUpgrades).toEqual(before.purchasedUpgrades);
  const invalid=structuredClone(after);invalid.profile.wonNightIds=invalid.profile.wonNightIds.filter(id=>id!=='far-shore');
  expect(()=>decodeSave(JSON.stringify(invalid))).toThrow();
 });
});
describe('armor lens correction',()=>{
 it('uses multiplier 1 without changing price, width, targets, armor or other lens effects',()=>{
  const l=LENSES.find(n=>n.id==='armor-breaker')!;
  expect(l).toMatchObject({damageMultiplier:1,widthMultiplier:.7,rangeMultiplier:1,maxTargets:1,slowMultiplier:1,armorMultiplier:2,materialCost:3});
  expect(LENS_UPGRADES.filter(n=>n.lensId===l.id).reduce((s,n)=>s+n.cost,0)).toBe(285);
  const c=calculateNightConfig(NIGHT_CONFIG,nodeIds,false,{lensId:l.id,upgrades:LENS_UPGRADES.map(n=>n.id)});
  expect(c.beam.damagePerSecond).toBe(72);expect(c.lens!.armorMultiplier).toBe(2.5);
  const before=calculateNightConfig(NIGHT_CONFIG,nodeIds,false,{lensId:'basic',upgrades:LENS_UPGRADES.map(n=>n.id)});
  expect(before.beam.damagePerSecond).toBe(64);
 });
 it('regains ordinary armor advantage while focused still kills unarmored targets faster',()=>{
  const times:Record<string,number>={};
  for(const lensId of ['armor-breaker','focused'] as LensId[])for(const kind of ['turtle','ghost'] as const){
   const c=calculateNightConfig(NIGHT_CONFIG,nodeIds,false,{lensId,upgrades:LENS_UPGRADES.map(n=>n.id)});
   c.enemies[kind].speed=0;c.waves=[{id:'target',enemies:[kind],spawnInterval:100}];
   const s=createBattle(c,42);s.waves[0]!.spawned=1;s.beamAngle=s.desiredBeamAngle=0;
   s.enemies=[{id:1,kind,x:180,y:0,health:c.enemies[kind].health,armor:c.enemies[kind].armor,waveIndex:0,attackCooldown:0}];
   while(s.enemies.length&&s.tick<900)stepBattle(s,c,[]);expect(s.enemies).toHaveLength(0);times[lensId+'/'+kind]=s.elapsed;
  }
  expect(times['armor-breaker/turtle']).toBeLessThan(times['focused/turtle']!);
  expect(times['focused/ghost']).toBeLessThan(times['armor-breaker/ghost']!);console.log(times);
 });
});
