import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { NightId, UpgradeId, SaveStore } from '../../src/contracts';
import { SaveRepository } from '../../src/application/saves';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { calculateNightConfig, getUpgradeAvailability } from '../../src/progression/upgrades';
import { getLensAvailability, getLensUpgradeAvailability } from '../../src/progression/lenses';
import { deviceDeployments, battleDeviceDeployments, normalizedDeviceResults, repairCost, rechargeCost } from '../../src/progression/devices';
import { auditBattle } from '../helpers/balance200Policy';

it('measures an earned route from zero to 200 purchases without touching user storage',()=>{
 const store:SaveStore & {raw:string|null}={raw:null,read(){return this.raw;},write(v){this.raw=v;}};
 const repo=new SaveRepository(store);repo.load();
 const opening:UpgradeId[][]=[['beam-power-1','unlock-cannon'],['unlock-barrier','unlock-generator','cannon-damage-1'],['device-slots-3','barrier-health-1'],['cannon-damage-2']];
 const stages:NightId[]=['first-light','broken-shore','winged-tide','abyss-warden','far-shore'];
 const rows:object[]=[],milestones:object[]=[];let minutes=0,earned=0,service=0,pearls=0,boughtCost=0;
 const count=()=>repo.current.profile.purchasedUpgrades.length+repo.current.profile.lensUpgrades.length+repo.current.profile.unlockedLenses.length-1;
 const positions={cannon:{x:-100,y:-90},barrier:{x:-235,y:0},generator:{x:-70,y:0},harpoon:{x:-100,y:90}};
 let nextStage=0;
 for(let attempt=0;attempt<220&&count()<200;attempt++){
  const id=stages[nextStage]??(pearls<59?'abyss-warden':'far-shore');
  const p=repo.current.profile;
  const c=calculateNightConfig(NIGHT_CATALOG.find(n=>n.id===id)!.config,p.purchasedUpgrades,p.legacyEquipment,{lensId:'basic',upgrades:p.lensUpgrades,bossLevel:p.bossLevel});
  const selected=(Object.keys(positions) as (keyof typeof positions)[]).flatMap(kind=>{const d=p.devices.find(d=>d.kind===kind);return d?[{id:d.id,kind,...positions[kind]}]:[];}).slice(0,c.devices.typeSlots);
  repo.savePlacements(selected,c);
  const snapshot=deviceDeployments(repo.current.profile);
  repo.begin({id:'route-'+attempt,nightId:id,seed:42,placementCost:0,lensId:'basic',...(id==='abyss-warden'?{bossLevel:p.bossLevel,bossReward:c.boss!.materialReward}:{})});
  const r=auditBattle(c,42,battleDeviceDeployments(repo.current.profile,c.devices.definitions),{flash:true});
  expect(r.outcome).not.toBe('playing');
  repo.settle('route-'+attempt,r.outcome==='victory'?'victory':'defeat',r.reward,r.encountered,normalizedDeviceResults(r.devices,snapshot,c.devices.definitions));
  if(r.outcome==='victory'){if(nextStage<stages.length)nextStage++;if(id==='abyss-warden')pearls+=c.boss!.materialReward;}
  minutes+=r.seconds/60;earned+=r.reward;
  let bill=0;
  for(const d of repo.current.profile.devices){
   const repair=repairCost(d,repo.current.profile.purchasedUpgrades),rearm=rechargeCost(d,repo.current.profile.purchasedUpgrades);bill+=repair+rearm;
   repo.repairDevice(d.id);if(d.kind==='light-trap')repo.rechargeDevice(d.id);
  }
  service+=bill;
  const reserve=repo.current.profile.devices.filter(d=>d.position).reduce((sum,d)=>sum+repairCost({...d,health:0},repo.current.profile.purchasedUpgrades),0);
  const buy=(nodeId:UpgradeId)=>{
   const node=UPGRADES.find(n=>n.id===nodeId)!;
   if(getUpgradeAvailability(repo.current.profile,nodeId).status==='available'&&repo.current.profile.resources-node.cost>=reserve){repo.purchase(nodeId);boughtCost+=node.cost;}
  };
  if(attempt<4)for(const nodeId of opening[attempt]!)buy(nodeId);
  else {
   for(const id of ['beam-power-2','beam-width-1','beam-range-1','beam-turn-1','lighthouse-health-1'] as UpgradeId[])buy(id);
   for(const node of UPGRADES)buy(node.id);
   for(const lens of LENSES)if(getLensAvailability(repo.current.profile,lens.id).status==='available')repo.purchaseLens(lens.id);
   for(const node of LENS_UPGRADES)if(getLensUpgradeAvailability(repo.current.profile,node.id).status==='available'&&repo.current.profile.resources-node.cost>=reserve){repo.purchaseLensUpgrade(node.id);boughtCost+=node.cost;}
  }
  repo.load();
  for(const threshold of [25,50,100,150,175,200])if(count()>=threshold&&!milestones.some((m:any)=>m.threshold===threshold))milestones.push({threshold,attempts:attempt+1,minutes,earned,service,pearls,boughtCost,nodes:count(),balance:repo.current.profile.resources});
  rows.push({attempt:attempt+1,id,win:r.outcome==='victory',seconds:r.seconds,reward:r.reward,bill,nodes:count(),resources:repo.current.profile.resources,materials:repo.current.profile.bossMaterials});
 }
 expect(count()).toBe(200);expect(boughtCost).toBe(21515);
 mkdirSync('test-results/balance',{recursive:true});writeFileSync('test-results/balance/balance-200-progression.json',JSON.stringify({policy:'fixed seed 42; basic lens; four persistent devices; catalogue-order purchases; reserve full repair of deployed bodies',milestones,rows,minutes,earned,service,pearls},null,2));
 console.table(milestones);
},120000);
