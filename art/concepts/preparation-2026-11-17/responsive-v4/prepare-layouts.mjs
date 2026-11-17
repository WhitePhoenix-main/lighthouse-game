import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const here=new URL('.',import.meta.url),read=p=>fs.readFileSync(new URL(p,here)),json=p=>JSON.parse(read(p));
const write=(p,v)=>fs.writeFileSync(new URL(p,here),JSON.stringify(v,null,2)+'\n');
const ctx=vm.createContext({});for(const p of ['scene-data.js','camera-geometry.js'])vm.runInContext(read('../world-v2/'+p).toString(),ctx);
const S=ctx.PREPARATION_SCENE,G=ctx.PreparationCameraGeometry,original=JSON.stringify(S);
const glyphs=json('../full-screen-v1/glyphs.json'),icons=json('../full-screen-v1/ui-icons.json'),skin=json('../mobile-slate-v3/ui-skin-layout.json');
const baseline=json('../full-screen-v1/field-layouts.json').find(x=>x.file==='field-desktop.png');
const C={ink:'#DFC7A2',muted:'#AAB7BE',background:'#08131D',amber:'#E6AC63',light:'#E9C77D',fog:'#9BBCCB',copper:'#A8754C'};
const rect=(x,y,width,height)=>({x,y,width,height});
const terrain=Object.fromEntries(Object.entries(S.terrain).map(([k,v])=>[k,v*.75]));
const terrainBounds=G.projectBounds(terrain,S.projectionY);
const required=G.overviewBounds(S,null),layouts=[],fields=[],calibrations=[];
function build(id,width,height,fieldTop,fieldBottom){
  const mobile=id==='mobile',fieldHeight=fieldBottom-fieldTop;
  const zoom=mobile?G.fit(required,width,fieldHeight,32).zoom:baseline.camera.zoom;
  const originY=(fieldTop+fieldBottom)/2;
  const camera={width,height,zoom,centerX:0,centerY:(height/2-originY)/zoom};
  const screenRect=b=>{const a=G.projectedToScreen({x:b.minX,y:b.minY},camera);return {...a,width:(b.maxX-b.minX)*zoom,height:(b.maxY-b.minY)*zoom};};
  const screenBounds=b=>{const r=screenRect(b);return{minX:r.x,minY:r.y,maxX:r.x+r.width,maxY:r.y+r.height};};
  const fieldWorld={minX:-width/(2*zoom),maxX:width/(2*zoom),minY:(fieldTop-originY)/zoom,maxY:(fieldBottom-originY)/zoom};
  assert(G.contains(terrainBounds,fieldWorld),'Active field terrain coverage '+id);
  const rb=screenBounds(required),free={minX:24,minY:fieldTop+24,maxX:width-24,maxY:fieldBottom-24};
  assert(G.contains(free,rb),'Required radii and objects clear UI '+id);
  const sprites=[...S.objects].sort((a,b)=>a.y-b.y).map(o=>{const s=S.sprites[o.kind];const r={id:o.id,asset:S.assets[s.asset].split('/').at(-1),frame:s.frame,...screenRect(G.spriteBounds(o,s,S.projectionY)),world:{x:o.x,y:o.y},health:o.health,maxHealth:o.maxHealth};
    assert(Math.abs(r.width/r.height-s.frame.width/s.frame.height)<1e-12,'Sprite aspect '+o.id);
    if(!mobile){const b=baseline.sprites.find(s=>s.id===o.id);assert.equal(r.width,b.width);assert.equal(r.height,b.height);}
    return r;});
  fields.push({id,file:`field-${id}.png`,width,height,camera,terrain:{asset:S.assets.terrain.split('/').at(-1),...screenRect(terrainBounds)},areas:[[S.rules.spawnRadius,C.fog],[S.rules.beamRange,C.light]].map(([radius,color])=>({...screenRect(G.circleBounds({x:0,y:0},radius,S.projectionY)),color,dashed:true,radius})),sprites,legend:[]});
  const L={id,file:id+'.png',width,height,field:`field-${id}.png`,colors:C,fieldTop,fieldBottom,areaStrokeWidth:mobile?3:2,panels:[],bands:[],quiet:[],texts:[],icons:[],chevrons:[],strokes:[],controls:[],fontSizes:[],source:S.source};
  const control=(name,r)=>{L.controls.push({name,...r});return r;};
  const panel=(name,r,sourceName=name,opacity=1)=>{const s=skin.panels.find(x=>x.name===sourceName);assert(s,'Skin source '+sourceName);assert(r.width>s.insets.left+s.insets.right&&r.height>s.insets.top+s.insets.bottom);L.panels.push({name,source:s.source,target:r,insets:s.insets,borderOnly:false,opacity});return control(name,r);};
  function text(value,x,y,scale,color=C.ink,align='left',container=rect(0,0,width,height),role='primary'){
    for(const c of value)assert(c===' '||glyphs[c],'Glyph '+c);
    const measuredWidth=(value.length*9-1)*scale,left=Math.round(x-(align==='center'?measuredWidth/2:align==='right'?measuredWidth:0)),top=y-(value.includes('Й')?3*scale:0),b=rect(left,top,measuredWidth+1,y+9*scale+2-top);
    assert(b.x>=container.x&&b.y>=container.y&&b.x+b.width<=container.x+container.width&&b.y+b.height<=container.y+container.height,'Text bounds '+id+': '+value);
    for(const prior of L.texts){const a=prior.bounds;assert(!(b.x<a.x+a.width&&b.x+b.width>a.x&&b.y<a.y+a.height&&b.y+b.height>a.y),'Text overlap '+value+' / '+prior.value);}
    L.texts.push({value,x,y,scale,color,align,measuredWidth,bounds:b,role});
    L.fontSizes.push({value,role,glyphPixels:9*scale,cssPixels:9*scale/(mobile?2:1),scale});
  }
  function icon(name,x,y,w,h){const f=icons.frames[name];assert(f);const scale=Math.min(w/f.width,h/f.height);assert(x>=0&&y>=0&&x+w<=width&&y+h<=height);L.icons.push({name,...rect(x,y,w,h),containScale:scale,aspect:f.width/f.height});}
  const stroke=(x,y,w,h,color=C.copper)=>L.strokes.push({...rect(x,y,w,h),color});
  const quiet=(x,y,w,h,alpha=140)=>L.quiet.push({...rect(x,y,w,h),alpha,color:C.background});
  L.bands.push({...rect(0,0,width,fieldTop),alpha:205,textureOpacity:.32,edge:'bottom'},{...rect(0,fieldBottom,width,height-fieldBottom),alpha:212,textureOpacity:.32,edge:'top'});
  if(mobile){
    const back=panel('back',rect(16,16,162,88));text('НАЗАД',97,45,3.25,C.ink,'center',back);
    panel('shard',rect(194,16,300,88));icon('shard',210,31,56,56);text('136',282,44,3.5);text('+',456,44,3.5,C.amber,'center');control('shard-plus',rect(406,16,88,88));
    panel('pearl',rect(510,16,254,88));icon('pearl',526,31,56,56);text('3',606,44,3.5);text('+',726,44,3.5,C.amber,'center');control('pearl-plus',rect(676,16,88,88));
    text('ГЛАВА I · ТУМАННЫЙ БЕРЕГ',390,130,3.25,C.ink,'center');text('НОЧЬ 2 · РАЗБИТЫЙ БЕРЕГ',366,176,3.25,C.ink,'center');L.chevrons.push({x:728,y:181,size:10,color:C.amber});control('night-selector',rect(16,116,748,90));
    panel('utilities',rect(16,211,748,88),'lens',.92);stroke(389,225,2,60);control('upgrades',rect(16,211,366,88));control('recon',rect(398,211,366,88));icon('upgrades',30,225,60,60);text('УЛУЧШЕНИЯ',106,240,3.25);icon('recon',412,225,60,60);text('РАЗВЕДКА',490,240,3.25);
    quiet(16,314,748,178,142);text('4 ВОЛНЫ',32,336,3.25);panel('zoom',rect(382,314,382,88),'zoom',.90);icon('zoom',398,334,48,48);text('КРУПНЫЙ',478,332,3.25);text('ПЛАН',478,365,3.25);
    stroke(34,422,32,3,C.light);text('СВЕТ МАЯКА',84,407,3.25,C.light);stroke(34,466,32,3,C.fog);text('ВЫХОД ИЗ ТУМАНА',84,451,3.25,C.fog);
    text('ОБЪЕКТЫ 3/4',24,1301,3.25,C.muted);text('ТИПЫ 2/2',482,1301,3.25,C.muted);
    panel('devices',rect(16,1344,748,88),'lens',.92);icon('devices',32,1356,76,64);text('УСТРОЙСТВА',130,1373,3.5);L.chevrons.push({x:724,y:1375,size:10,color:C.amber});stroke(24,1434,732,2,'#455461');
    panel('equipment',rect(16,1444,748,88),'lens');control('lens',rect(16,1444,374,88));control('ability',rect(390,1444,374,88));icon('lens',36,1459,56,56);icon('flash',410,1459,56,56);stroke(389,1456,2,64);
    text('ЛИНЗА',112,1455,2.5,C.muted,'left',rect(100,1448,280,80),'secondary');text('БАЗОВАЯ',112,1490,3.25);
    text('СПОСОБНОСТЬ',486,1455,2.25,C.muted,'left',rect(474,1448,280,80),'secondary');text('ВСПЫШКА',486,1490,3.25);
    const start=panel('start',rect(16,1544,748,88));text('НАЧАТЬ НОЧЬ',390,1569,4,C.ink,'center',start);
    text('РАССТАНОВКА И СТАРТ БЕСПЛАТНЫ',390,1645,2.75,C.muted,'center',rect(16,1638,748,38),'secondary');
  }else{
    panel('back',rect(18,14,172,64),'back',.92);text('НАЗАД',104,37,2.25,C.ink,'center');
    text('ГЛАВА I · ТУМАННЫЙ БЕРЕГ',218,25,1.75,C.muted);text('НОЧЬ 2 · РАЗБИТЫЙ БЕРЕГ',218,55,1.75);L.chevrons.push({x:614,y:58,size:6,color:C.amber});control('night-selector',rect(202,10,430,76));
    panel('shard',rect(638,14,246,64),'shard',.94);icon('shard',654,25,44,44);text('136',714,37,2.5);text('+',848,37,2.5,C.amber,'center');control('shard-plus',rect(818,14,60,64));
    panel('pearl',rect(897,14,217,64),'pearl',.94);icon('pearl',913,25,44,44);text('3',977,37,2.5);text('+',1078,37,2.5,C.amber,'center');control('pearl-plus',rect(1048,14,60,64));
    panel('upgrades',rect(1126,14,272,64),'upgrades',.88);icon('upgrades',1138,25,44,44);text('УЛУЧШЕНИЯ',1200,37,2);
    panel('recon',rect(1420,14,234,64),'recon',.88);icon('recon',1432,25,44,44);text('РАЗВЕДКА',1490,37,2);
    quiet(22,114,386,112,150);text('ПОДГОТОВКА · 4 ВОЛНЫ',38,130,1.75);stroke(38,177,24,2,C.light);text('СВЕТ МАЯКА',76,168,1.75,C.light);stroke(38,210,24,2,C.fog);text('ВЫХОД ИЗ ТУМАНА',76,201,1.75,C.fog);
    panel('zoom',rect(1334,116,316,68),'zoom',.90);icon('zoom',1348,128,44,44);text('КРУПНЫЙ ПЛАН',1410,143,1.75);
    control('devices',rect(24,790,424,116));icon('devices',40,812,80,64);text('УСТРОЙСТВА',142,810,2.5);text('ВЫБРАТЬ И РАССТАВИТЬ',142,857,1.5,C.muted,'left',rect(130,794,310,100),'secondary');
    control('lens',rect(474,800,212,100));control('ability',rect(710,800,276,100));icon('lens',482,824,44,44);icon('flash',718,824,44,44);text('ЛИНЗА',542,808,1.75,C.muted);text('БАЗОВАЯ',542,855,2);text('СПОСОБНОСТЬ',778,808,1.75,C.muted);text('ВСПЫШКА',778,855,2);
    stroke(456,798,2,98);stroke(1000,798,2,98);text('ОБЪЕКТЫ 3/4',1144,815,1.75,C.muted,'center');text('ТИПЫ 2/2',1144,855,1.75,C.muted,'center');
    const start=panel('start',rect(1286,790,366,100));text('НАЧАТЬ НОЧЬ',1469,828,3,C.ink,'center',start);
    text('РАССТАНОВКА И СТАРТ БЕСПЛАТНЫ',1469,909,1.25,C.muted,'center',rect(1280,898,382,32),'secondary');
  }
  const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const contains=(r,b)=>b.x>=r.x&&b.y>=r.y&&b.x+b.width<=r.x+r.width&&b.y+b.height<=r.y+r.height;
  for(const t of L.texts)for(const i of L.icons)assert(!overlaps(t.bounds,i),'Text overlaps icon '+t.value+' / '+i.name);
  for(const p of L.panels){
    assert(p.target.x>=0&&p.target.y>=0&&p.target.x+p.target.width<=width&&p.target.y+p.target.height<=height);
    assert(p.source.x>=0&&p.source.y>=0&&p.source.x+p.source.width<=953&&p.source.y+p.source.height<=1651);
    for(const t of L.texts){const b=t.bounds,center={x:b.x+b.width/2,y:b.y+b.height/2,width:0,height:0};if(contains(p.target,center))assert(contains(p.target,b),'Panel text fit '+t.value);}
  }
  for(const q of L.quiet){
    for(const sprite of sprites)assert(!overlaps(q,sprite),'Map tools obscure world object '+sprite.id);
    for(const t of L.texts){const b=t.bounds,center={x:b.x+b.width/2,y:b.y+b.height/2,width:0,height:0};if(contains(q,center))assert(contains(q,b),'Quiet map tools text fit '+t.value);}
  }
  layouts.push(L);calibrations.push({id,camera,field:rect(0,fieldTop,width,fieldHeight),fieldFraction:fieldHeight/height,requiredScreenBounds:rb,activeFieldTerrainCoverage:true,terrainCoversFullCanvas:G.contains(terrainBounds,G.visibleBounds(camera)),spriteDimensions:sprites.map(s=>({id:s.id,width:s.width,height:s.height})),worldPositions:S.objects.map(o=>({id:o.id,x:o.x,y:o.y})),rules:S.rules});
}
build('mobile',780,1688,300,1290);build('desktop',1672,941,96,770);
assert.equal(JSON.stringify(S),original);
assert.deepEqual(calibrations[0].worldPositions,calibrations[1].worldPositions);assert.deepEqual(calibrations[0].rules,calibrations[1].rules);
const paths=['../world-v2/scene-data.js','../world-v2/camera-geometry.js','../world-v2/terrain-coast-irregular-v1.png','../world-v2/lighthouse-main.png','../world-v2/props-atlas.png','../mobile-slate-v3/ui-chrome.png','../full-screen-v1/glyphs.json','../full-screen-v1/ui-icons.json','../full-screen-v1/ui-icons.png'];
write('layouts.json',layouts);write('fields.json',fields);write('cameras.json',calibrations.map(c=>({id:c.id,...c.camera})));
write('calibration.json',{status:'Reference proposal, unchanged canonical world; straight shoreX remains in game',terrainFactor:.75,oldTerrainBounds:S.terrain,newTerrainBounds:terrain,desktopBaselineZoom:baseline.camera.zoom,layouts:calibrations});
write('verification.json',{sources:paths.map(path=>({path,sha256:createHash('sha256').update(read(path)).digest('hex')})),checks:{sharedCoordinatesAndRules:true,spriteAspect:true,desktopSpriteDimensionsExactlyBaseline:true,terrainCoversActiveField:true,textBoundsAndNoTextOverlap:true,textIconNoOverlap:true,panelTextFits:true,mapToolsAvoidObjects:true,nineSliceCornerScale:1,sourceSceneUnchanged:true,render:'pending'},commands:['node art/concepts/preparation-2026-11-17/responsive-v4/prepare-layouts.mjs','powershell -NoProfile -File art/concepts/preparation-2026-11-17/responsive-v4/render.ps1','node --test art/concepts/preparation-2026-11-17/world-v2/camera-geometry.test.mjs']});
console.log('Prepared responsive layouts with shared world, fixed desktop props, mobile fit, and text/geometry invariants.');
