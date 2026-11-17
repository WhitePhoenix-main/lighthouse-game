import { it,expect } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import type { LensId,EnemyKind } from '../../src/contracts';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES,LENS_UPGRADES } from '../../src/content/lenses';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { calculateNightConfig } from '../../src/progression/upgrades';
import { createBattle,stepBattle } from '../../src/simulation/battle';
import { selectBeamTargets } from '../../src/simulation/beam';

it('checks lens roles on prolonged targets and tests armor tuning in copies only',()=>{
 const rows:object[]=[];
 const scenarios:[string,EnemyKind,number,number,number][]=[
  ['single-ghost','ghost',1,1,1],['single-turtle','turtle',1,1,1],['four-ghosts','ghost',4,1,1],
  ['armored-elite','turtle',1,1,8],['prolonged-group','ghost',4,20,1]];
 const ids:LensId[]=LENSES.map(l=>l.id);
 for(const id of ids)for(const multiplier of id==='armor-breaker'?[.8,.9,1]:[null])for(const [scenario,kind,count,hpScale,armorScale] of scenarios){
  const c=calculateNightConfig(NIGHT_CATALOG[0]!.config,UPGRADES.map(n=>n.id),false,{lensId:id,upgrades:LENS_UPGRADES.map(n=>n.id)});
  if(multiplier!==null)c.beam.damagePerSecond+=(multiplier-.8)*58;
  for(const e of Object.values(c.enemies))e.speed=0;
  c.enemies[kind].health*=hpScale;c.enemies[kind].armor*=armorScale;
  c.waves=[{id:'lens',enemies:Array<EnemyKind>(count).fill(kind),spawnInterval:100}];
  const s=createBattle(c,42);s.waves[0]!.spawned=count;s.beamAngle=s.desiredBeamAngle=0;
  s.enemies=Array.from({length:count},(_,i)=>{const a=count===1?0:-.24+i*.16;return{id:i+1,kind,x:180*Math.cos(a),y:180*Math.sin(a),health:c.enemies[kind].health,armor:c.enemies[kind].armor,waveIndex:0,attackCooldown:0};});
  while(s.enemies.length&&s.tick<3600){const target=s.enemies[0]!,angle=selectBeamTargets(s.enemies,c,0).lit.length?0:Math.atan2(target.y,target.x);stepBattle(s,c,[{type:'aim',angle}]);}
  expect(s.enemies).toHaveLength(0);
  rows.push({lens:id,multiplier,scenario,seconds:s.elapsed});
 }
 expect(LENSES.find(l=>l.id==='armor-breaker')!.damageMultiplier).toBe(.8);
 mkdirSync('test-results/balance',{recursive:true});writeFileSync('test-results/balance/balance-200-lens-candidates.json',JSON.stringify({note:'Copies only. No production tuning applied. Same complete general tree; synthetic stationary targets.',rows},null,2));
});
