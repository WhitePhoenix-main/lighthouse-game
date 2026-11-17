import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const here = new URL('.', import.meta.url);
const read = name => fs.readFileSync(new URL(name, here), 'utf8');
const write = (name, value) => fs.writeFileSync(new URL(name, here), JSON.stringify(value, null, 2) + '\n');
const context = vm.createContext({});
for (const name of ['scene-data.js', 'camera-geometry.js']) vm.runInContext(read('../world-v2/' + name), context);
const scene = context.PREPARATION_SCENE, G = context.PreparationCameraGeometry;
const original = JSON.stringify(scene);
const baseline = JSON.parse(read('../full-screen-v1/field-layouts.json')).find(x => x.file === 'field-desktop.png');
const glyphs = JSON.parse(read('../full-screen-v1/glyphs.json'));
const width = 1672, height = 941, factor = 0.75;
const camera = {centerX: 0, centerY: 0, zoom: baseline.camera.zoom, width, height};
const rect = (x,y,width,height) => ({x,y,width,height});
const boundsRect = bounds => {
  const point = G.projectedToScreen({x:bounds.minX,y:bounds.minY},camera);
  return {...point,width:(bounds.maxX-bounds.minX)*camera.zoom,height:(bounds.maxY-bounds.minY)*camera.zoom};
};
const terrainWorld = Object.fromEntries(Object.entries(scene.terrain).map(([key,value])=>[key,value*factor]));
const terrainProjected = G.projectBounds(terrainWorld,scene.projectionY);
assert(G.contains(terrainProjected,G.visibleBounds(camera)), 'Calibrated source texture must cover entire canvas');
const usable = {minX:24,minY:120,maxX:1648,maxY:746};
const screenBounds = bounds => {const r=boundsRect(bounds);return {minX:r.x,minY:r.y,maxX:r.x+r.width,maxY:r.y+r.height};};
const requiredBounds = screenBounds(G.overviewBounds(scene,null));
assert(G.contains(usable,requiredBounds),'Required gameplay bounds must clear stone strips with 24px margin');
const areas = [[scene.rules.spawnRadius,'#9BBCCB'],[scene.rules.beamRange,'#E9C77D']].map(([radius,color])=>({...boundsRect(G.circleBounds({x:0,y:0},radius,scene.projectionY)),color,dashed:true}));
const sprites = [...scene.objects].sort((a,b)=>a.y-b.y).map(object=>{
  const sprite=scene.sprites[object.kind];
  const result={id:object.id,asset:scene.assets[sprite.asset].split('/').at(-1),frame:sprite.frame,...boundsRect(G.spriteBounds(object,sprite,scene.projectionY)),health:object.health,maxHealth:object.maxHealth};
  const prior=baseline.sprites.find(x=>x.id===result.id);
  assert.equal(result.width,prior.width,`${object.id} fixed width`);
  assert.equal(result.height,prior.height,`${object.id} fixed height`);
  assert(Math.abs(result.width/result.height-sprite.frame.width/sprite.frame.height)<1e-12,`${object.id} source aspect`);
  return result;
});
const field={file:'field-desktop.png',width,height,padding:24,mode:'overview',selected:null,camera:{zoom:camera.zoom,centerX:0,centerY:0},terrain:{asset:scene.assets.terrain.split('/').at(-1),...boundsRect(terrainProjected)},areas,legend:[],sprites};
write('field-layout.json',[field]);

const colors={ink:'#E7DEC8',muted:'#9BB2B9',gold:'#E9C77D',blue:'#9BBCCB'};
const layout={id:'desktop',file:'desktop-unified.png',field:field.file,width,height,chrome:'ui-chrome.png',texts:[],icons:[],strokes:[],chevrons:[],controls:{},exampleState:{shards:136,pearls:3,placedObjects:3,objectLimit:4,deviceTypes:2,typeLimit:2,lens:'basic',ability:'flash',waves:4,placementFree:true}};
// The same 8x9 glyphs and 9-unit advance as full-screen-v1. Include shadow and Й accent in QA bounds.
function text(value,x,y,scale,color=colors.ink,align='left',container=rect(0,0,width,height)) {
  const measuredWidth=Math.max(0,value.length*9-1)*scale;
  for(const c of value) assert(c===' ' || glyphs[c],`Missing glyph ${c}`);
  const left=Math.round(x-(align==='center'?measuredWidth/2:align==='right'?measuredWidth:0));
  const top=y-(value.includes('Й')?3*scale:0);
  const bounds=rect(left,top,measuredWidth+1,y+9*scale+2-top);
  assert(bounds.x>=container.x && bounds.y>=container.y && bounds.x+bounds.width<=container.x+container.width && bounds.y+bounds.height<=container.y+container.height,`Text clipped: ${value}`);
  layout.texts.push({value,x,y,scale,color,align,measuredWidth,bounds});
}
const control=(name,r)=>(layout.controls[name]=r,r);
const icon=(name,x,y,w,h)=>layout.icons.push({name,...rect(x,y,w,h)});
const back=control('back',rect(18,14,192,60));text('НАЗАД',114,35,2,colors.ink,'center',back);
const chapter=control('chapter',rect(232,10,400,67));
text('ГЛАВА I · ТУМАННЫЙ БЕРЕГ',248,28,1.5,colors.muted,'left',chapter);
text('НОЧЬ 2 · РАЗБИТЫЙ БЕРЕГ',248,53,1.5,colors.ink,'left',chapter);
layout.chevrons.push({x:610,y:54,size:5,color:colors.gold});
function resource(name,r,value){control(name,r);icon(name,r.x+12,r.y+10,42,42);text(value,r.x+67,r.y+23,2,colors.ink,'left',r);text('+',r.x+r.width-27,r.y+21,2.5,colors.gold,'center',r);}
resource('shard',rect(656,13,218,62),'136');resource('pearl',rect(905,13,193,62),'3');
function action(name,r,label,iconName,scale=2){control(name,r);icon(iconName,r.x+14,r.y+10,44,42);text(label,r.x+73,r.y+r.height/2-4.5*scale,scale,colors.ink,'left',r);}
action('upgrades',rect(1131,13,269,62),'УЛУЧШЕНИЯ','upgrades');
action('recon',rect(1428,13,235,62),'РАЗВЕДКА','recon');
action('zoom',rect(1356,113,298,62),'КРУПНЫЙ ПЛАН','zoom',1.5);
text('ПОДГОТОВКА · 4 ВОЛНЫ',38,126,1.5);
for(const [i,value,color] of [[0,'ДАЛЬНОСТЬ МАЯКА',colors.gold],[1,'ВЫХОД ИЗ ТУМАНА',colors.blue]]){
  layout.strokes.push({x:38,y:160+i*24,width:23,height:2,color});text(value,73,155+i*24,1.5,color);
}
const devices=control('devices',rect(24,796,442,113));icon('devices',43,818,78,60);
text('УСТРОЙСТВА',145,819,2,colors.ink,'left',devices);text('ВЫБРАТЬ И РАССТАВИТЬ',145,861,1.5,colors.muted,'left',devices);
const lens=control('lens',rect(504,804,195,90));icon('lens',518,826,40,40);
text('ЛИНЗА',570,822,1.5,colors.muted,'left',lens);text('БАЗОВАЯ',570,859,1.75,colors.ink,'left',lens);
const ability=control('ability',rect(714,804,256,90));icon('flash',729,826,40,40);
text('СПОСОБНОСТЬ',786,822,1.5,colors.muted,'left',ability);text('ВСПЫШКА',786,859,1.75,colors.ink,'left',ability);
const counts=control('counts',rect(1010,812,270,66));text('ОБЪЕКТЫ 3/4',1145,819,1.75,colors.muted,'center',counts);text('ТИПЫ 2/2',1145,850,1.75,colors.muted,'center',counts);
const start=control('start',rect(1296,789,355,90));text('НАЧАТЬ НОЧЬ',1473.5,824,2.75,colors.gold,'center',start);
const footer=control('footer',rect(1296,887,355,40));text('РАССТАНОВКА И СТАРТ',1473.5,889,1.5,colors.muted,'center',footer);text('БЕСПЛАТНЫ',1473.5,912,1.25,colors.muted,'center',footer);
assert.equal(JSON.stringify(scene),original,'Canonical scene must remain unchanged');
write('layout.json',layout);
write('calibration.json',{
  status:'Desktop reference scale proposal only; canonical world and mobile unchanged',
  sourceSceneSha256:createHash('sha256').update(original).digest('hex'),
  sourceTexture:'../world-v2/terrain-coast-irregular-v1.png',sourceTextureUnchanged:true,
  baseline:'../full-screen-v1/field-layouts.json#field-desktop.png',
  terrainOnlyWorldFactor:factor,oldTerrainWorldBounds:scene.terrain,newTerrainWorldBounds:terrainWorld,
  oldProjectedTextureSize:{width:baseline.terrain.width,height:baseline.terrain.height},
  newProjectedTextureSize:{width:field.terrain.width,height:field.terrain.height},
  fixedObjectZoom:camera.zoom,newCamera:camera,worldOriginScreen:G.worldToScreen({x:0,y:0},camera,scene.projectionY),
  freeField:{minX:0,maxX:width,minY:96,maxY:770},requiredMargin:24,requiredBounds,
  checks:{spriteDimensionsExactlyEqualBaseline:true,sourceSpriteAspectPreserved:true,worldPositionsAndRulesUnchanged:true,textureCoversEntireCanvas:true,requiredBoundsClearPanels:true,terrainScaleOnly:true,textBoundsValid:true},
  sprites:sprites.map(s=>({id:s.id,width:s.width,height:s.height})),
});
console.log('Prepared desktop-only reference: same props / rules / zoom, terrain at 0.75, all bounds validated.');
