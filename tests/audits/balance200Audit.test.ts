import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { UpgradeId, LensId, DeviceKind, EnemyKind } from '../../src/contracts';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { getBossRules } from '../../src/content/boss';
import { DEVICE_RULES } from '../../src/content/devices';
import { emptySave, decodeSave, SaveRepository } from '../../src/application/saves';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { actualDeviceHealth, deviceDeployments, normalizedDeviceResults, repairCost, rechargeCost } from '../../src/progression/devices';
import { grantFixtureDevices } from '../helpers/devices';
import { checkDraft } from '../../src/application/placement';
import { createBattle, stepBattle } from '../../src/simulation/battle';
import { selectBeamTargets } from '../../src/simulation/beam';
import { auditBattle } from '../helpers/balance200Policy';
const specs: {name:string;lens:LensId;gear:DeviceKind[];priority:string[]}[]=[
 {name:'balanced',lens:'basic',gear:['cannon','harpoon','barrier','generator'],priority:['beam-power','cannon-','harpoon-','beam-turn','beam-width','beam-range','lighthouse-health','shield-']},
 {name:'beam',lens:'focused',gear:['cannon','harpoon','barrier','generator'],priority:['beam-power','beam-armor','beam-execute','beam-turn','beam-range','beam-width','paired-light','hull-','lighthouse-health']},
 {name:'control',lens:'slowing',gear:['cannon','bell','barrier','generator'],priority:['bell-','beam-power','beam-width','beam-range','beam-turn','shield-','hull-','lighthouse-health']},
 {name:'artillery',lens:'smoldering',gear:['mortar','cannon','light-trap','generator'],priority:['mortar-','trap-','cannon-','beam-support','engineering-','beam-power','shield-']},
 {name:'fortress',lens:'basic',gear:['cannon','barrier','generator','repair-lamp'],priority:['hull-','lighthouse-health','shield-','generator-','barrier-','repair-','beam-power']},
];
const unlock:Record<DeviceKind,UpgradeId>={cannon:'unlock-cannon',harpoon:'unlock-harpoon',barrier:'unlock-barrier',generator:'unlock-generator',mortar:'unlock-mortar',bell:'unlock-bell','light-trap':'unlock-trap','repair-lamp':'unlock-repair-lamp'};
function build(spec:typeof specs[number],budget:number){
 const save=emptySave(),p=save.profile;
 Object.assign(p,{resources:100000,bossMaterials:100,bossLevel:3,completedNights:8,wonNightIds:NIGHT_CATALOG.map(n=>n.id)});
 const owned=new Set<UpgradeId>();let cost=0;
 const lensNodes=LENS_UPGRADES.filter(n=>n.lensId===spec.lens);
 const lensCost=lensNodes.reduce((s,n)=>s+n.cost,0);cost+=lensCost;
 function closure(id:UpgradeId,out=new Set<UpgradeId>()){
  if(owned.has(id)||out.has(id))return out;
  const node=UPGRADES.find(n=>n.id===id)!;for(const req of node.requires)closure(req,out);out.add(id);return out;
 }
 function buy(id:UpgradeId,required=false){
  const batch=[...closure(id)],price=batch.reduce((s,id)=>s+UPGRADES.find(n=>n.id===id)!.cost,0);
  if(cost+price>budget){if(required)throw Error('mandatory budget');return;}
  for(const id of batch)owned.add(id);cost+=price;
 }
 for(const id of ['beam-power-1','beam-turn-1','lighthouse-health-1','device-slots-4','unlock-flash',...spec.gear.map(k=>unlock[k])] as UpgradeId[])buy(id,true);
 const preferred=spec.priority.flatMap(prefix=>UPGRADES.filter(n=>n.id.startsWith(prefix)));
 for(const n of [...preferred,...UPGRADES])buy(n.id);
 const full=budget===Infinity;
 if(full)for(const n of UPGRADES)owned.add(n.id);
 p.purchasedUpgrades=UPGRADES.filter(n=>owned.has(n.id)).map(n=>n.id);
 p.unlockedLenses=full?LENSES.map(l=>l.id):['basic',...spec.lens==='basic'?[]:[spec.lens]];
 p.lensUpgrades=full?LENS_UPGRADES.map(n=>n.id):lensNodes.map(n=>n.id);
 p.selectedLensId=spec.lens;grantFixtureDevices(p);
 const selected=spec.gear.map(k=>p.devices.find(d=>d.kind===k)!);
 let bodyCost=0;
 if(full)for(const k of spec.gear){
  const d={id:p.nextDeviceId++,kind:k,health:DEVICE_RULES.definitions[k].health,consumed:false,position:null,...k==='light-trap'?{trapCharges:2}:{}};
  p.devices.push(d);selected.push(d);bodyCost+=DEVICE_RULES.definitions[k].cost;
 }
 const coords:Record<DeviceKind,number[][]>={cannon:spec.name==='artillery'?[[-100,90],[-75,210]]:[[-100,-90],[-180,-180]],harpoon:[[-100,90],[-180,180]],barrier:[[-235,0],[-235,115]],generator:[[-70,0],[-135,0]],mortar:[[-145,-90],[-190,-165]],'light-trap':[[-235,-100],[-200,150]],bell:[[-100,90],[-180,180]],'repair-lamp':[[-140,90],[-135,170]]};
 const used:Partial<Record<DeviceKind,number>>={};
 selected.forEach(d=>{const index=used[d.kind]??0;used[d.kind]=index+1;d.position={x:coords[d.kind][index]![0]!,y:coords[d.kind][index]![1]!};});
 if(full)cost=21515; // All 200 purchases, including unused lenses; body copies are separate.
 const pearls=full?59:LENSES.find(l=>l.id===spec.lens)!.materialCost+lensNodes.reduce((s,n)=>s+n.materialCost,0);
 expect(cost+ (full?0:bodyCost)).toBeLessThanOrEqual(budget);
 expect(decodeSave(JSON.stringify(save))).toEqual(save);
 return {save,cost:cost+bodyCost,pearls,bodyCost,unused:full?0:budget-cost};
}
const seeds=[7,42,137];
describe('full tree balance audit (isolated profiles)',()=>{
 it('compares matched budgets, all lenses, survival and net income',()=>{
  const rows:Record<string,unknown>[]=[],builds:Record<string,unknown>[]=[];
  for(const budget of [2000,5000,Infinity])for(const spec of specs){
   const b=build(spec,budget),p=b.save.profile,loadout={lensId:spec.lens,upgrades:p.lensUpgrades,bossLevel:3};
   builds.push({name:spec.name,budget:Number.isFinite(budget)?budget:'full',cost:b.cost,pearls:b.pearls,unused:b.unused,nodes:p.purchasedUpgrades.length+p.lensUpgrades.length+p.unlockedLenses.length-1,purchased:p.purchasedUpgrades,lensUpgrades:p.lensUpgrades});
   for(const id of ['winged-tide','far-shore','abyss-warden'] as const)for(const mode of ['normal','stress','hard'] as const)for(const seed of seeds){
    const c=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id===id)!.config,p.purchasedUpgrades,false,loadout);
    if(mode!=='normal'){
     // Synthetic sensitivity scenario, never saved into content.
     c.waves=c.waves.map(w=>({...w,enemies:Array.from({length:mode==='hard'?3:2},()=>w.enemies).flat(),spawnInterval:w.spawnInterval*(mode==='hard'?.5:.65)}));
     c.waveInterval*=mode==='hard'?.5:.65;for(const e of Object.values(c.enemies)){e.health*=mode==='hard'?2.5:1.5;e.attackDamage*=mode==='hard'?2:1.5;}
     if(c.boss){c.boss.health*=mode==='hard'?2.5:1.5;c.boss.attackDamage*=mode==='hard'?2:1.5;}
    }
    const snapshot=deviceDeployments(p);
    expect(checkDraft(c,snapshot).valid).toBe(true);
    const deployed=snapshot.map(d=>({...d,health:actualDeviceHealth(p.devices.find(x=>x.id===d.id)!,c.devices.definitions)}));
    const r=auditBattle(c,seed,deployed,{reactionSeconds:mode==='hard'?2.1:mode==='stress'?1.4:.7,flash:true});

    const normalized=normalizedDeviceResults(r.devices,snapshot,c.devices.definitions);
    let repairs=0,rearm=0,destroyed=0;
    for(const d of normalized){
     const body={...p.devices.find(x=>x.id===d.id)!,health:d.health,consumed:d.consumed,trapCharges:d.trapCharges};
     repairs+=repairCost(body,p.purchasedUpgrades);rearm+=rechargeCost(body,p.purchasedUpgrades);if(d.health<=0)destroyed++;
    }
    const net=r.reward-repairs-rearm;
    rows.push({name:spec.name,lens:spec.lens,budget:Number.isFinite(budget)?budget:'full',id,mode,seed,win:r.outcome==='victory',timeout:r.outcome==='playing',
     hp:r.health,maxHP:c.lighthouseHealth,damage:r.damageTaken,seconds:r.seconds,reward:r.reward,repairs,rearm,net,netPerMinute:net/r.seconds*60,destroyed,flashes:r.flashes});
   }
  }
  const lensRows:Record<string,unknown>[]=[];
  for(const lens of LENSES)for(const [kind,count] of [['ghost',1],['turtle',1],['ghost',4],['turtle',4]] as [EnemyKind,number][]){
   const c=calculateNightConfig(NIGHT_CATALOG[0]!.config,UPGRADES.map(n=>n.id),false,{lensId:lens.id,upgrades:LENS_UPGRADES.map(n=>n.id)});
   for(const e of Object.values(c.enemies))e.speed=0;
   c.waves=[{id:'ttk',enemies:Array<EnemyKind>(count).fill(kind),spawnInterval:100}];
   const s=createBattle(c,42);s.waves[0]!.spawned=count;s.beamAngle=s.desiredBeamAngle=0;
   s.enemies=Array.from({length:count},(_,i)=>{const a=count===1?0:-.24+i*.16;return{id:i+1,kind,x:180*Math.cos(a),y:180*Math.sin(a),health:c.enemies[kind].health,armor:c.enemies[kind].armor,waveIndex:0,attackCooldown:0};});
   while(s.enemies.length&&s.tick<3600){
    const target=s.enemies[0]!,angle=selectBeamTargets(s.enemies,c,0).lit.length?0:Math.atan2(target.y,target.x);
    stepBattle(s,c,[{type:'aim',angle}]);
   }
   expect(s.enemies).toHaveLength(0);
   lensRows.push({lens:lens.id,scenario:count+' '+kind,seconds:s.elapsed,dps:c.beam.damagePerSecond,targets:c.beam.maxTargets,
    shards:LENS_UPGRADES.filter(n=>n.lensId===lens.id).reduce((s,n)=>s+n.cost,0),pearls:lens.materialCost+LENS_UPGRADES.filter(n=>n.lensId===lens.id).reduce((s,n)=>s+n.materialCost,0)});
  }
  const bossRewards=[1,2,3].map(level=>getBossRules(level).materialReward);
  mkdirSync('test-results/balance',{recursive:true});
  writeFileSync('test-results/balance/balance-200.json',JSON.stringify({rules:'prototype-19-complete-tree',seeds,builds,rows,lensRows,bossRewards},null,2));
  expect(rows).toHaveLength(405);expect(lensRows).toHaveLength(32);
 },120000);
 it('keeps generated profiles and purchases local and verifies repair/recharge settlement once',()=>{
  const b=build(specs[3]!,5000);let raw=JSON.stringify(b.save);
  const repo=new SaveRepository({read:()=>raw,write:v=>{raw=v;}});repo.load();
  const before=repo.current;
  const c=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id==='far-shore')!.config,before.profile.purchasedUpgrades,false,{lensId:'smoldering',upgrades:before.profile.lensUpgrades});
  const snapshot=deviceDeployments(before.profile),deployed=snapshot.map(d=>({...d,health:actualDeviceHealth(before.profile.devices.find(x=>x.id===d.id)!,c.devices.definitions)}));
  const result=auditBattle(c,42,deployed,{flash:true});
  repo.begin({id:'audit-only',nightId:'far-shore',seed:42,placementCost:0,lensId:'smoldering'});
  repo.settle('audit-only',result.outcome==='victory'?'victory':'defeat',result.reward,result.encountered,normalizedDeviceResults(result.devices,snapshot,c.devices.definitions));
  const paid=repo.current;
  const bill=paid.profile.devices.reduce((s,d)=>s+repairCost(d,paid.profile.purchasedUpgrades)+rechargeCost(d,paid.profile.purchasedUpgrades),0);
  for(const d of paid.profile.devices){repo.repairDevice(d.id);if(d.kind==='light-trap')repo.rechargeDevice(d.id);}
  expect(repo.current.profile.resources).toBe(paid.profile.resources-bill);
  const after=repo.current;repo.settle('audit-only','victory',result.reward,result.encountered);repo.load();expect(repo.current).toEqual(after);
  expect(repo.current.profile.purchasedUpgrades).toEqual(before.profile.purchasedUpgrades);
 });
});
