import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const context = vm.createContext({});
for (const file of ['scene-data.js', 'camera-geometry.js']) {
  vm.runInContext(fs.readFileSync(new URL('../world-v2/' + file, import.meta.url), 'utf8'), context);
}
const scene = context.PREPARATION_SCENE;
const geometry = context.PreparationCameraGeometry;
const lettering = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../pixel-lettering.js', import.meta.url), 'utf8') + '\nglobalThis.glyphs = settingsGlyphs;', lettering);
const glyphs = { ...lettering.glyphs, '/': ['00000011','00000110','00000110','00001100','00011000','00110000','01100000','01100000','11000000'] };
fs.writeFileSync(directory + 'glyphs.json', JSON.stringify(glyphs) + '\n');

const rect = (x,y,width,height) => ({x,y,width,height});
const colors = { ink: '#E7DEC8', muted: '#9BB2B9', gold: '#E9C77D', blue: '#9BBCCB' };
const layouts = [];
function build(id,width,height,viewport,padding) {
  const layout = { id, file:`full-${id}.png`, width,height, viewport,padding, field:`field-${id}.png`, mode:'overview',selected:null,
    source:{nightId:scene.source.nightId, rulesVersion:scene.source.rulesVersion, beamRange:scene.rules.beamRange, spawnRadius:scene.rules.spawnRadius},
    exampleState:{shards:136,pearls:3,placedObjects:3,objectLimit:4,deviceTypes:2,typeLimit:2,lens:'basic',ability:'flash',waves:4,placementFree:true},
    panels:[], texts:[], icons:[], strokes:[], chevrons:[] };
  const panel = (name,r,style='normal') => {layout.panels.push({name,...r,style});return r;};
  const text = (value,x,y,scale=2,color=colors.ink,align='left',maxWidth=null) => {
    const measuredWidth = Math.max(0,value.length*9-1)*scale;
    for (const c of value) if(c!==' ' && !glyphs[c]) throw new Error(`Missing glyph ${c}`);
    if(maxWidth!==null && measuredWidth>maxWidth) throw new Error(`${id}: ${value}: ${measuredWidth}>${maxWidth}`);
    const left = Math.round(x-(align==='center'?measuredWidth/2:align==='right'?measuredWidth:0));
    const top = y-(value.includes('Й')?3*scale:0);
    if(left<0 || left+measuredWidth+1>width || top<0 || y+9*scale+2>height) throw new Error(`Text outside screen: ${value}`);
    layout.texts.push({value,x,y,scale,color,align,measuredWidth,bounds:rect(left,top,measuredWidth+1,y+9*scale+2-top)});
  };
  const icon = (name,x,y,width,height) => layout.icons.push({name,...rect(x,y,width,height)});
  const resource = (name,r,value) => {
    panel(name,r); const size=r.height-20; icon(name,r.x+12,r.y+10,size,size);
    const scale=r.height<=64?2:2.5;
    text(value,r.x+size+28,r.y+r.height/2-9*scale/2,scale,colors.ink,'left',r.width-size-80);
    layout.strokes.push({x:r.x+r.width-58,y:r.y+18,width:2,height:r.height-36,color:'#52616A'});
    text('+',r.x+r.width-29,r.y+r.height/2-11,2.5,colors.gold,'center');
  };
  const legend = (x,y,scale) => {
    for(const [index,value,color] of [[0,'ДАЛЬНОСТЬ МАЯКА',colors.gold],[1,'ВЫХОД ИЗ ТУМАНА',colors.blue]]) {
      layout.strokes.push({x,y:y+index*24+5,width:24,height:2,color});
      text(value,x+35,y+index*24,scale,color);
    }
  };
  const action = (name,r,label,iconName,scale=2) => {
    panel(name,r); const size=Math.min(r.height-20,76); icon(iconName,r.x+18,r.y+(r.height-size)/2,size,size);
    const start=r.x+size+36; text(label,(start+r.x+r.width-20)/2,r.y+r.height/2-9*scale/2,scale,colors.ink,'center',r.width-size-56);
  };
  if(id==='mobile') {
    panel('back',rect(24,20,210,80));text('НАЗАД',129,49,2.5,colors.ink,'center');
    resource('shard',rect(282,20,286,80),'136');resource('pearl',rect(602,20,261,80),'3');
    text('ГЛАВА I · ТУМАННЫЙ БЕРЕГ',443,130,2,colors.muted,'center',790);
    text('НОЧЬ 2 · РАЗБИТЫЙ БЕРЕГ',424,180,2.5,colors.ink,'center',770);
    layout.chevrons.push({x:818,y:186,size:8,color:colors.gold});
    action('upgrades',rect(24,224,410,104),'УЛУЧШЕНИЯ','upgrades',2.5);
    action('recon',rect(453,224,410,104),'РАЗВЕДКА','recon',2.5);
    text('ПОДГОТОВКА · 4 ВОЛНЫ',30,371,2,colors.ink,'left',465);
    action('zoom',rect(535,344,328,70),'КРУПНЫЙ ПЛАН','zoom',1.5);
    legend(46,453,1.5);
    text('ОБЪЕКТЫ 3/4 · ТИПЫ 2/2',443,1227,2,colors.muted,'center',800);
    panel('devices',rect(24,1268,839,116));icon('devices',48,1282,88,88);
    text('УСТРОЙСТВА',166,1292,2.5);text('ВЫБРАТЬ И РАССТАВИТЬ',166,1336,2,colors.muted);
    layout.chevrons.push({x:816,y:1320,size:8,color:colors.gold});
    panel('lens',rect(24,1398,410,112));icon('lens',42,1420,66,66);
    text('ЛИНЗА',130,1420,2,colors.muted);text('БАЗОВАЯ',130,1460,2.5);
    panel('ability',rect(453,1398,410,112));icon('flash',470,1420,66,66);
    text('СПОСОБНОСТЬ',555,1420,2,colors.muted);text('ВСПЫШКА',555,1460,2.5);
    panel('start',rect(24,1528,839,142),'primary');text('НАЧАТЬ НОЧЬ',443,1586,4,colors.gold,'center',750);
    text('РАССТАНОВКА И СТАРТ БЕСПЛАТНЫ',443,1707,2,colors.muted,'center',810);
  } else {
    panel('back',rect(20,14,170,64));text('НАЗАД',105,37,2,colors.ink,'center');
    panel('chapter',rect(205,14,390,64));text('ГЛАВА I · ТУМАННЫЙ БЕРЕГ',221,30,1.5,colors.muted);
    text('НОЧЬ 2 · РАЗБИТЫЙ БЕРЕГ',221,52,1.5);layout.chevrons.push({x:572,y:56,size:5,color:colors.gold});
    resource('shard',rect(615,14,190,64),'136');resource('pearl',rect(815,14,165,64),'3');
    action('upgrades',rect(1000,14,280,64),'УЛУЧШЕНИЯ','upgrades',2);
    action('recon',rect(1295,14,350,64),'РАЗВЕДКА','recon',2);
    text('ПОДГОТОВКА · 4 ВОЛНЫ',43,119,1.5,colors.ink);
    legend(43,149,1.5);
    action('zoom',rect(1356,110,278,60),'КРУПНЫЙ ПЛАН','zoom',1.5);
    text('ОБЪЕКТЫ 3/4 · ТИПЫ 2/2',43,741,2,colors.muted);
    panel('devices',rect(35,775,410,106));icon('devices',49,792,70,70);
    text('УСТРОЙСТВА',139,799,2);text('ВЫБРАТЬ И РАССТАВИТЬ',139,839,1.5,colors.muted);
    panel('lens',rect(460,775,235,106));icon('lens',474,803,45,45);
    text('ЛИНЗА',532,802,1.5,colors.muted);text('БАЗОВАЯ',532,840,1.75);
    panel('ability',rect(710,775,235,106));icon('flash',723,804,42,42);
    text('СПОСОБНОСТЬ',777,802,1.5,colors.muted);text('ВСПЫШКА',777,840,1.75);
    panel('start',rect(970,755,665,126),'primary');text('НАЧАТЬ НОЧЬ',1302,803,3.5,colors.gold,'center',620);
    text('РАССТАНОВКА И СТАРТ БЕСПЛАТНЫ',1302,903,1.75,colors.muted,'center',650);
  }
  layouts.push(layout);
}
build('mobile',887,1774,rect(24,430,839,770),32);
build('desktop',1672,941,rect(20,96,1632,620),80);

function screenRect(bounds,camera) {
  const point=geometry.projectedToScreen({x:bounds.minX,y:bounds.minY},camera);
  return {...point,width:(bounds.maxX-bounds.minX)*camera.zoom,height:(bounds.maxY-bounds.minY)*camera.zoom};
}
const fields=layouts.map(layout=>{
  const {width,height}=layout.viewport;
  const camera=geometry.cameraFor(scene,null,'overview',width,height,layout.padding);
  const terrainBounds=geometry.projectBounds(scene.terrain,scene.projectionY);
  if(!geometry.contains(terrainBounds,geometry.visibleBounds(camera))) throw new Error('Terrain does not cover viewport');
  const circle=(radius,color)=>({...screenRect(geometry.circleBounds({x:0,y:0},radius,scene.projectionY),camera),color,dashed:true});
  return {file:layout.field,width,height,padding:layout.padding,mode:'overview',selected:null,
    camera:{zoom:camera.zoom,centerX:camera.centerX,centerY:camera.centerY},
    terrain:{asset:scene.assets.terrain.split('/').at(-1),...screenRect(terrainBounds,camera)},
    areas:[circle(scene.rules.spawnRadius,'#9BBCCB'),circle(scene.rules.beamRange,'#E9C77D')],legend:[],
    sprites:[...scene.objects].sort((a,b)=>a.y-b.y).map(object=>{
      const sprite=scene.sprites[object.kind];
      return {id:object.id,asset:scene.assets[sprite.asset].split('/').at(-1),frame:sprite.frame,
        ...screenRect(geometry.spriteBounds(object,sprite,scene.projectionY),camera),health:object.health,maxHealth:object.maxHealth};
    })};
});
fs.writeFileSync(directory+'layouts.json',JSON.stringify(layouts,null,2)+'\n');
fs.writeFileSync(directory+'field-layouts.json',JSON.stringify(fields,null,2)+'\n');
console.log('Prepared full-screen layouts, field cameras and validated pixel glyph bounds.');
