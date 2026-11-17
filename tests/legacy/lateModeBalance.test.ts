import { expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { NightId, LateNightMode } from '../../src/contracts';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { resolveLateNight } from '../../src/content/lateModes';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { battleDeviceDeployments, deviceDeployments, normalizedDeviceResults, repairCost, rechargeCost } from '../../src/progression/devices';
import { checkDraft } from '../../src/application/placement';
import { specs } from '../helpers/lateBuilds';
import { pressureBuild } from '../helpers/latePressureBuilds';
import { auditBattle } from '../helpers/balance200Policy';

const late: NightId[]=['armored-front','sky-siege','cross-current'];
const builds=[...specs,{...specs[1]!,name:'armor',lens:'armor-breaker' as const}];
type Row={budget:number|string;name:string;id:NightId;seed:number;mode:LateNightMode;objects:number;
 win:boolean;seconds:number;damage:number;health:number;reward:number;repair:number;rearm:number;net:number};
it('makes transition accessible while reproducing assault and counting service on every outcome',()=>{
 const rows:Row[]=[];
 const previous=JSON.parse(readFileSync('reports/late-pressure.json','utf8')) as {rows:(Omit<Row,'mode'>&{mode:string})[]};
 for(const budget of [2000,5000,10000,Infinity])for(const spec of builds)for(const id of late)for(const seed of [7,42,137,271,733,2026]){
  const modes:LateNightMode[]=Number.isFinite(budget)?['transition']:['transition','assault'];
  for(const mode of modes){
   const b=pressureBuild(spec,budget),p=b.save.profile;
   expect(b.cost).toBeLessThanOrEqual(budget);
   const config=calculateNightConfig(resolveLateNight(NIGHT_CATALOG.find(n=>n.id===id)!.config,mode),
    p.purchasedUpgrades,false,{lensId:spec.lens,upgrades:p.lensUpgrades});
   const snapshot=deviceDeployments(p);
   expect(checkDraft(config,snapshot).valid).toBe(true);
   const r=auditBattle(config,seed,battleDeviceDeployments(p,config.devices.definitions),{flash:true});
   expect(r.outcome).not.toBe('playing');
   if(r.outcome==='victory'){
    expect(r.reward).toBe(mode==='transition'?190:260);
    expect(r.seconds).toBeGreaterThanOrEqual(120);
    expect(r.seconds).toBeLessThanOrEqual(240);
   }else expect(r.victoryReward).toBe(0);
   const devices=normalizedDeviceResults(r.devices,snapshot,config.devices.definitions);
   let repair=0,rearm=0;
   for(const d of devices){
    const body={...p.devices.find(v=>v.id===d.id)!,health:d.health,consumed:d.consumed,trapCharges:d.trapCharges};
    repair+=repairCost(body,p.purchasedUpgrades);rearm+=rechargeCost(body,p.purchasedUpgrades);
   }
   const row:Row={budget:Number.isFinite(budget)?budget:'full',name:spec.name,id,seed,mode,objects:snapshot.length,
    win:r.outcome==='victory',seconds:r.seconds,damage:r.damageTaken,health:r.health,reward:r.reward,repair,rearm,net:r.reward-repair-rearm};
   rows.push(row);
   if(mode==='assault'){
    const before=previous.rows.find(x=>x.budget==='full'&&x.mode==='prepared'&&x.name===spec.name&&x.id===id&&x.seed===seed)!;
    expect(before).toBeDefined();
    for(const key of ['win','seconds','damage','health','reward','repair','rearm','net'] as const)expect(row[key]).toBe(before[key]);
   }
  }
 }
 mkdirSync('test-results/balance', {recursive:true});writeFileSync('test-results/balance/late-modes.json',JSON.stringify({rules:'prototype-22-late-modes',rows},null,2));
 expect(rows).toHaveLength(540);
 for(const id of late){
  const partial=rows.filter(r=>r.budget===5000&&r.id===id),entry=rows.filter(r=>r.budget===2000&&r.id===id);
  expect(partial.filter(r=>r.win).length).toBeGreaterThanOrEqual(24);
  expect(entry.filter(r=>r.win).length).toBeGreaterThanOrEqual(12);
  expect(partial.reduce((s,r)=>s+r.net,0)/partial.length).toBeGreaterThan(80);
  const full=rows.filter(r=>r.budget==='full'&&r.mode==='transition'&&r.id===id);
  const rate=full.reduce((s,r)=>s+r.net,0)/full.reduce((s,r)=>s+r.seconds,0)*60;
  expect(rate).toBeLessThan(80);
 }
 const assault=rows.filter(r=>r.mode==='assault');
 expect(assault.filter(r=>r.win)).toHaveLength(94);
 expect(assault.filter(r=>r.damage>0)).toHaveLength(51);
},120000);
