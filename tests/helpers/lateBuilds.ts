import { expect } from 'vitest';
import type { UpgradeId, LensId, DeviceKind } from '../../src/contracts';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { DEVICE_RULES } from '../../src/content/devices';
import { emptySave, decodeSave } from '../../src/application/saves';
import { grantFixtureDevices } from './devices';
export const specs: {name:string;lens:LensId;gear:DeviceKind[];priority:string[]}[]=[
 {name:'balanced',lens:'basic',gear:['cannon','harpoon','barrier','generator'],priority:['beam-power','cannon-','harpoon-','beam-turn','beam-width','beam-range','lighthouse-health','shield-']},
 {name:'beam',lens:'focused',gear:['cannon','harpoon','barrier','generator'],priority:['beam-power','beam-armor','beam-execute','beam-turn','beam-range','beam-width','paired-light','hull-','lighthouse-health']},
 {name:'control',lens:'slowing',gear:['cannon','bell','barrier','generator'],priority:['bell-','beam-power','beam-width','beam-range','beam-turn','shield-','hull-','lighthouse-health']},
 {name:'artillery',lens:'smoldering',gear:['mortar','cannon','light-trap','generator'],priority:['mortar-','trap-','cannon-','beam-support','engineering-','beam-power','shield-']},
 {name:'fortress',lens:'basic',gear:['cannon','barrier','generator','repair-lamp'],priority:['hull-','lighthouse-health','shield-','generator-','barrier-','repair-','beam-power']},
];
const unlock:Record<DeviceKind,UpgradeId>={cannon:'unlock-cannon',harpoon:'unlock-harpoon',barrier:'unlock-barrier',generator:'unlock-generator',mortar:'unlock-mortar',bell:'unlock-bell','light-trap':'unlock-trap','repair-lamp':'unlock-repair-lamp'};
export function build(spec:typeof specs[number],budget:number){
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
