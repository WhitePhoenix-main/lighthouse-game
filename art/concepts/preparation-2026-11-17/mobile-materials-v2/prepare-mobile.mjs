import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const here=new URL('.',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,here));
const json=name=>JSON.parse(read(name));
const write=(name,value)=>fs.writeFileSync(new URL(name,here),JSON.stringify(value,null,2)+'\n');
const hash=name=>createHash('sha256').update(read(name)).digest('hex');
const glyphs=json('../full-screen-v1/glyphs.json');
const atlas=json('../full-screen-v1/ui-icons.json');
const size=name=>{const png=read(name);assert.equal(png.toString('ascii',1,4),'PNG');return [png.readUInt32BE(16),png.readUInt32BE(20)];};
for(const name of ['user-mobile-reference.png','ui-chrome.png']) assert.deepEqual(size(name),[887,1774],name+' native canvas');
const rect=(x,y,width,height)=>({x,y,width,height});
const colors={ink:'#EFE4C4',muted:'#B8B6A0',gold:'#DDB36C'};
const layout={file:'mobile-warm.png',source:'user-mobile-reference.png',chrome:'ui-chrome.png',width:887,height:1774,mapROI:rect(34,440,800,660),colors,texts:[],icons:[],chevrons:[],strokes:[]};
function text(value,x,y,scale,color=colors.ink,align='left',container=rect(0,0,887,1774)){
  for(const c of value) assert(c===' '||glyphs[c],'Missing glyph '+c);
  const measuredWidth=(value.length*9-1)*scale;
  const left=Math.round(x-(align==='center'?measuredWidth/2:align==='right'?measuredWidth:0));
  const top=y-(value.includes('Й')?3*scale:0);
  const bounds=rect(left,top,measuredWidth+1,y+9*scale+2-top);
  assert(bounds.x>=container.x&&bounds.y>=container.y&&bounds.x+bounds.width<=container.x+container.width&&bounds.y+bounds.height<=container.y+container.height,'Text clipped: '+value);
  const roi=layout.mapROI;
  assert(bounds.x+bounds.width<=roi.x||bounds.x>=roi.x+roi.width||bounds.y+bounds.height<=roi.y||bounds.y>=roi.y+roi.height,'Text intersects frozen map: '+value);
  layout.texts.push({value,x,y,scale,color,align,measuredWidth,bounds});
}
function icon(name,x,y,width,height){
  const frame=atlas.frames[name];assert(frame,'Missing icon '+name);
  const scale=Math.min(width/frame.width,height/frame.height);
  const renderedWidth=frame.width*scale,renderedHeight=frame.height*scale;
  assert(Math.abs(renderedWidth/renderedHeight-frame.width/frame.height)<1e-12);
  assert(x>=0&&y>=0&&x+width<=887&&y+height<=1774,'Icon bounds '+name);
  layout.icons.push({name,...rect(x,y,width,height),renderedWidth,renderedHeight});
}
text('НАЗАД',139,43,3,colors.ink,'center',rect(37,32,200,43));
icon('shard',326,20,70,70);text('136',409,40,3);text('+',524,40,3,colors.gold,'center');
icon('pearl',622,20,72,72);text('3',736,40,3);text('+',817,40,3,colors.gold,'center');
text('ГЛАВА I · ТУМАННЫЙ БЕРЕГ',443,110,2.75,colors.ink,'center');
text('НОЧЬ 2 · РАЗБИТЫЙ БЕРЕГ',431,149,2.5,colors.ink,'center');
layout.chevrons.push({x:705,y:152,size:8,color:colors.gold});
icon('upgrades',62,210,64,64);text('УЛУЧШЕНИЯ',164,227,2.75,colors.ink,'left',rect(54,208,361,66));
icon('recon',475,210,64,64);text('РАЗВЕДКА',582,227,2.75,colors.ink,'left',rect(468,208,363,66));
text('ПОДГОТОВКА · 4 ВОЛНЫ',77,320,2.25);
icon('zoom',565,311,36,36);text('КРУПНЫЙ ПЛАН',615,319,1.75,colors.ink,'left',rect(560,309,293,40));
text('ОБЪЕКТЫ 3/4 · ТИПЫ 2/2',443,1190,2,colors.muted,'center');
icon('devices',75,1249,260,100);
text('УСТРОЙСТВА',405,1264,3.5,colors.ink,'left',rect(393,1248,446,102));
text('ВЫБРАТЬ И РАССТАВИТЬ',405,1320,2,colors.muted,'left',rect(393,1248,446,102));
icon('lens',60,1410,94,94);text('ЛИНЗА',195,1426,2.5,colors.ink,'left',rect(45,1406,371,103));
text('БАЗОВАЯ',195,1474,2,colors.muted,'left',rect(45,1406,371,103));
icon('flash',478,1410,94,94);text('СПОСОБНОСТЬ',593,1426,2.25,colors.ink,'left',rect(470,1406,372,103));
text('ВСПЫШКА',593,1474,2,colors.muted,'left',rect(470,1406,372,103));
text('НАЧАТЬ НОЧЬ',443,1588,4.75,colors.ink,'center',rect(50,1568,787,88));
text('РАССТАНОВКА И СТАРТ БЕСПЛАТНЫ',443,1695,1.75,colors.muted,'center',rect(195,1682,497,48));
const sourceNames=['user-mobile-reference.png','ui-chrome.png','../full-screen-v1/ui-icons.png','../full-screen-v1/ui-icons.json','../full-screen-v1/glyphs.json'];
write('layout.json',layout);
write('verification.json',{
  scope:'Static mobile color/material study of selected historical illustration; not current world geometry',
  size:[887,1774],mapROI:layout.mapROI,
  sources:sourceNames.map(path=>({path,sha256:hash(path)})),
  transforms:{source:'native coordinates, identity',chrome:'native coordinates, identity',map:'identity; no recolor or scaling; guaranteed ROI restored from native source after overlay to neutralize isolated A=1 alpha dust'},
  checks:{nativeCanvas:true,allTextBoundsValid:true,sourceIconAspectPreserved:true,renderAndPixelParity:'pending'},
  iconRounding:'Uniform source scale followed by nearest whole pixel destination; less than 1px quantization per axis',
});
console.log('Prepared native mobile materials study; all glyph and icon bounds valid.');
