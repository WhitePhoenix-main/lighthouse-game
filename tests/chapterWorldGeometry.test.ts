import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHAPTER_TERRAIN, CHAPTER_TERRAIN_BOUNDS, isLandCircle, isLandPoint, landSpawnAngle, shoreAtY, SHORELINE_SOURCE_PIXELS, validateTerrain } from '../src/content/terrain';
import { NIGHT_CONFIG } from '../src/content/night';
import { NIGHT_CATALOG, validateNightDefinitions } from '../src/content/nights';
import { checkDraft, checkPlacement } from '../src/application/placement';
import { createBattle } from '../src/simulation/battle';
import { isLandPoint as mortarLandPoint } from '../src/simulation/mortar';
import { createWorldCamera, screenToWorld, worldToScreen, WORLD_PROJECTION_Y, WORLD_SPRITES, spriteBounds, deviceArea } from '../src/presentation/shared/world/worldGeometry';
import type { NightConfig } from '../src/contracts';

const config=():NightConfig=>({...structuredClone(NIGHT_CONFIG),terrain:structuredClone(CHAPTER_TERRAIN)});
describe('authoritative irregular coastline',()=>{
 it('keeps the legacy straight shore and allows touching with the complete body',()=>{
  const terrain={shoreX:0,landOnlyPlacement:true};
  expect(isLandCircle(terrain,{x:-16,y:20},16)).toBe(true);
  expect(isLandCircle(terrain,{x:-15.99,y:20},16)).toBe(false);
  expect(isLandPoint(undefined,{x:100,y:0})).toBe(true);
 });
 it('rejects a body crossing a diagonal even when its centre and horizontal radius appear inland',()=>{
  const terrain={shoreX:0,landOnlyPlacement:true,shoreline:[{x:-100,y:-100},{x:100,y:100}]};
  expect(isLandCircle(terrain,{x:-14.142135623730951,y:0},10)).toBe(true);
  expect(isLandCircle(terrain,{x:-14,y:0},10)).toBe(false);
 });
 it('checks inward vertices and continues endpoint rays outside the traced y extent',()=>{
  const terrain={shoreX:99,landOnlyPlacement:true,shoreline:[{x:20,y:-20},{x:0,y:0},{x:20,y:20}]};
  expect(isLandCircle(terrain,{x:-4,y:0},4)).toBe(true);
  expect(isLandCircle(terrain,{x:-3.9,y:0},4)).toBe(false);
  expect(shoreAtY(terrain,100)).toBe(20);
  expect(isLandCircle(terrain,{x:16,y:100},4)).toBe(true);
  expect(isLandCircle(terrain,{x:17,y:100},4)).toBe(false);
 });
 it('keeps saved coordinates intact while invalid draft blocks start, and uses the same coast for mortar',()=>{
  const c=config();const device={id:1,kind:'cannon' as const,x:0,y:-150};
  const snapshot=structuredClone(device);
  expect(checkPlacement(c,[],'cannon',device.x,device.y).valid).toBe(false);
  expect(checkDraft(c,[device]).valid).toBe(false);expect(device).toEqual(snapshot);
  expect(mortarLandPoint(c,device)).toBe(isLandPoint(c.terrain,device));
  expect(checkPlacement(c,[],'cannon',-170,-150).valid).toBe(true);
 });
 it('validates finite strictly ordered source geometry and production content references',()=>{
  expect(()=>validateNightDefinitions(NIGHT_CATALOG)).not.toThrow();
  for(const shoreline of [[],[{x:0,y:0}],[{x:0,y:1},{x:0,y:1}],[{x:0,y:0},{x:Infinity,y:1}]])expect(()=>validateTerrain({shoreX:0,landOnlyPlacement:true,shoreline})).toThrow();
 });
 it('maps traced source pixels to the same projected terrain rectangle without stretching',()=>{
  const inspection=JSON.parse(readFileSync('art/concepts/preparation-2026-11-17/world-v2/asset-inspection.json','utf8')) as Record<string,{size:number[]}>;
  expect(inspection['terrain-coast-irregular-v1.png']!.size).toEqual([1536,1024]);
  const b=CHAPTER_TERRAIN_BOUNDS;
  expect((b.maxX-b.minX)/((b.maxY-b.minY)*WORLD_PROJECTION_Y)).toBeCloseTo(1.5,12);
  CHAPTER_TERRAIN.shoreline!.forEach((p,i)=>{const [x,y]=SHORELINE_SOURCE_PIXELS[i]!;expect((p.x-b.minX)/(b.maxX-b.minX)*1536).toBeCloseTo(x,10);expect((p.y-b.minY)/(b.maxY-b.minY)*1024).toBeCloseTo(y,10);});
 });
 it('spawns ground bodies on permitted arcs deterministically using one RNG sample per enemy',()=>{
  const c=config();c.waves=[{id:'ground',enemies:Array.from({length:100},(_,i)=>i%2?'minotaur':'turtle'),spawnInterval:0}];
  const a=createBattle(c,123),b=createBattle(c,123);
  expect(a).toEqual(b);expect(a.enemies).toHaveLength(100);
  for(const enemy of a.enemies)expect(isLandCircle(c.terrain,enemy,c.enemies[enemy.kind].radius)).toBe(true);
  let calls=0;createBattle(c,321,{next:()=>{calls++;return .5;}});expect(calls).toBe(100);
  for(const sample of [0,.001,.5,.999,1]) {const angle=landSpawnAngle(c.terrain!,c.spawnRadius,30,sample);expect(isLandCircle(c.terrain,{x:Math.cos(angle)*c.spawnRadius,y:Math.sin(angle)*c.spawnRadius},30)).toBe(true);}
 });
});
describe('shared projected world camera',()=>{
 it.each([[1280,720],[720,360],[360,640]])('keeps the same framing and visible combat extent between headland preparation and battle at %i×%i',(width,height)=>{
  const c: NightConfig = {...config(),campaignMapId:'headland'};
  const preparation = createWorldCamera(c,width,height);
  const battle = createWorldCamera(c,width,height,{mode:'battle'});
  expect(preparation).toEqual(battle);
  expect(battle.y).toBeCloseTo(height * (height > width ? .52 : .585));
  const topLeft = worldToScreen(battle,-c.worldRadius,-c.worldRadius);
  const bottomRight = worldToScreen(battle,c.worldRadius,c.worldRadius);
  expect(topLeft.x).toBeGreaterThan(0);
  expect(topLeft.y).toBeGreaterThan(0);
  expect(bottomRight.x).toBeLessThan(width);
  expect(bottomRight.y).toBeLessThan(height);
 });
 it.each([[1280,720,.78],[844,390,.48],[390,844,.4275]])('keeps the Rift Coast world extent in a common camera at %i×%i',(width,height,expectedZoom)=>{
  const c: NightConfig = {...config(),campaignMapId:'rift-coast'};
  const device = {id:1,kind:'cannon' as const,x:-230,y:95};
  const preparation = createWorldCamera(c,width,height,{mode:'overview',devices:[device],selected:device});
  const battle = createWorldCamera(c,width,height,{mode:'battle',devices:[device]});
  expect(preparation).toEqual(battle);
  expect(battle.zoom).toBeCloseTo(expectedZoom,2);
  const northwest = worldToScreen(battle,-c.worldRadius,-c.worldRadius);
  const southeast = worldToScreen(battle,c.worldRadius,c.worldRadius);
  expect(northwest.x).toBeGreaterThanOrEqual(24-1e-7);
  expect(southeast.x).toBeLessThanOrEqual(width-24+1e-7);
  expect(northwest.y).toBeGreaterThanOrEqual(height*.14-1e-7);
  expect(southeast.y).toBeLessThanOrEqual(height*.83+1e-7);
  const source = worldToScreen(battle,128,-184);
  const target = worldToScreen(battle,239,-158);
  expect(source.y).toBeGreaterThan(height*.14);
  expect(target.x).toBeLessThan(southeast.x);
  const point = screenToWorld(battle,target.x,target.y);
  expect(point.x).toBeCloseTo(239,9);
  expect(point.y).toBeCloseTo(-158,9);
 });
 it('keeps Rift Coast close and placement framing within the preparation field',()=>{
  const viewport = {x:0,y:100,width:844,height:217};
  const c = config();
  const rift: NightConfig = {...c,campaignMapId:'rift-coast'};
  const otherCoast: NightConfig = {...c,campaignMapId:'ashen-plateau'};
  for(const mode of ['close','overview'] as const) {
   const options = {mode,viewport,padding:16};
   expect(createWorldCamera(rift,844,390,options)).toEqual(createWorldCamera(otherCoast,844,390,options));
  }
 });
 for(const [width,height] of [[360,390],[390,700],[844,390],[1280,720],[1920,1080]] as const)it(`${width}x${height}: roundtrip and complete overview/battle areas inside active viewport`,()=>{
  const c=config(),device={id:1,kind:'cannon' as const,x:-210,y:-210},viewport={x:20,y:40,width:width-40,height:height-80};
  const options={viewport,devices:[device],selected:device};const overview=createWorldCamera(c,width,height,options);
  for(const mode of ['overview','close','battle'] as const) {
   const camera=createWorldCamera(c,width,height,{...options,mode});
   for(const point of [{x:0,y:0},device,{x:400,y:200}]){const screen=worldToScreen(camera,point.x,point.y),back=screenToWorld(camera,screen.x,screen.y);expect(back.x).toBeCloseTo(point.x,9);expect(back.y).toBeCloseTo(point.y,9);}
   if(mode==='close')continue;
   if(mode==='battle')expect(camera.zoom).toBeLessThanOrEqual(overview.zoom);
   const assertInside=(x:number,y:number)=>{const p=worldToScreen(camera,x,y);expect(p.x).toBeGreaterThanOrEqual(viewport.x+24-1e-7);expect(p.x).toBeLessThanOrEqual(viewport.x+viewport.width-24+1e-7);expect(p.y).toBeGreaterThanOrEqual(viewport.y+24-1e-7);expect(p.y).toBeLessThanOrEqual(viewport.y+viewport.height-24+1e-7);};
   const area=deviceArea(c,device);
   for(const [x,y,r] of [[0,0,c.beam.range],[0,0,c.spawnRadius],[area.x,area.y,area.radius],...(mode==='battle'?[[0,0,c.worldRadius]]:[])]){assertInside(x!-r!,y!-r!);assertInside(x!+r!,y!+r!);}
   for(const [x,y,spec] of [[0,0,WORLD_SPRITES.lighthouse],[0,110,WORLD_SPRITES.pier],[device.x,device.y,WORLD_SPRITES.cannon]] as const){const b=spriteBounds(x,y,spec);assertInside(b.minX,b.minY/WORLD_PROJECTION_Y);assertInside(b.maxX,b.maxY/WORLD_PROJECTION_Y);expect((b.maxX-b.minX)/(b.maxY-b.minY)).toBeCloseTo(spec.frame.width/spec.frame.height,10);}
  }
 });
});
