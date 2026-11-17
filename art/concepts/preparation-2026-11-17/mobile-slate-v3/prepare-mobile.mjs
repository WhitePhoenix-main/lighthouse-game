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
const mapSource='../mobile-materials-v2/user-mobile-reference.png';
assert.deepEqual(size(mapSource),[887,1774],'Native selected map source');
assert.deepEqual(size('ui-chrome.png'),[953,1651],'Atlas dimensions');
const rect=(x,y,width,height)=>({x,y,width,height});
const colors={ink:'#DFC7A2',muted:'#AAB7BE',gold:'#DDB36C',background:'#08131D',copper:'#A8754C'};
const layout={file:'mobile-slate.png',source:mapSource,chrome:'ui-chrome.png',width:887,height:1774,mapROI:rect(34,440,800,660),mapCrop:rect(20,380,847,784),mapInterior:rect(30,390,827,764),colors,texts:[],icons:[],chevrons:[],strokes:[]};
const skin={image:'ui-chrome.png',size:[953,1651],cornerScale:1,fullAtlasStretch:false,panels:[]};
function panel(name,source,target,inset=20,borderOnly=false){
  const slices=typeof inset==='number'?{left:inset,right:inset,top:inset,bottom:inset}:inset;
  assert(source.x>=0&&source.y>=0&&source.x+source.width<=953&&source.y+source.height<=1651,'Atlas frame '+name);
  assert(target.x>=0&&target.y>=0&&target.x+target.width<=887&&target.y+target.height<=1774,'Target frame '+name);
  for(const r of [source,target])assert(r.width>slices.left+slices.right&&r.height>slices.top+slices.bottom,'Nine-slice frame minimum '+name);
  skin.panels.push({name,source,target,insets:slices,borderOnly});
}
panel('back',rect(26,19,243,64),rect(26,22,222,67));
const resourceInsets={left:20,right:64,top:20,bottom:20};
panel('shard',rect(325,19,283,64),rect(318,22,244,67),resourceInsets);
panel('pearl',rect(652,19,282,64),rect(615,22,240,67),resourceInsets);
panel('upgrades',rect(34,180,435,91),rect(42,197,388,86));
panel('recon',rect(485,180,435,91),rect(456,197,388,86));
panel('zoom',rect(591,283,344,50),rect(552,303,316,54),16);
panel('map',rect(14,346,927,747),rect(10,370,867,804),20,true);
panel('devices',rect(20,1146,914,130),rect(20,1233,847,140));
panel('lens',rect(20,1293,450,119),rect(24,1394,408,124));
panel('ability',rect(485,1293,450,119),rect(456,1394,408,124));
panel('start',rect(20,1439,914,119),rect(26,1546,835,128),32);
// Keep the field around panels quiet; no cropped decoration seams or old UI.
skin.decorations=[];
for(const [x,y,w,h] of [[281,29,2,52],[587,29,2,52],[48,1200,177,2],[664,1200,174,2],[56,1701,133,2],[696,1701,135,2]])layout.strokes.push({...rect(x,y,w,h),color:colors.copper});
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
const sourceNames=[mapSource,'ui-chrome.png','../full-screen-v1/ui-icons.png','../full-screen-v1/ui-icons.json','../full-screen-v1/glyphs.json'];
const bindings={back:['НАЗАД'],shard:['136'],pearl:['3'],upgrades:['УЛУЧШЕНИЯ'],recon:['РАЗВЕДКА'],zoom:['КРУПНЫЙ ПЛАН'],devices:['УСТРОЙСТВА','ВЫБРАТЬ И РАССТАВИТЬ'],lens:['ЛИНЗА','БАЗОВАЯ'],ability:['СПОСОБНОСТЬ','ВСПЫШКА'],start:['НАЧАТЬ НОЧЬ']};
const fits=(b,r)=>b.x>=r.x&&b.y>=r.y&&b.x+b.width<=r.x+r.width&&b.y+b.height<=r.y+r.height;
for(const [name,values] of Object.entries(bindings)){
  const frame=skin.panels.find(p=>p.name===name).target;
  for(const value of values){const label=layout.texts.find(t=>t.value===value);assert(label&&fits(label.bounds,frame),'Label frame fit '+value);}
}
for(const label of layout.texts.filter(t=>t.value==='+'))assert(skin.panels.filter(p=>['shard','pearl'].includes(p.name)).some(p=>fits(label.bounds,p.target)),'Resource plus frame fit');
write('layout.json',layout);
write('ui-skin-layout.json',skin);
write('verification.json',{
  scope:'Static mobile color/material study of selected historical illustration; not current world geometry',
  size:[887,1774],mapROI:layout.mapROI,
  sources:sourceNames.map(path=>({path,sha256:hash(path)})),
  transforms:{background:'Opaque code-native #08131D covers all old UI',chrome:'Panel atlas, nine-slice with 1:1 corners; full source never stretched',map:'Native crop at identical source/destination coordinates, no recolor or scaling; border-only panel above'},
  atlas:{size:skin.size,fullAtlasStretch:false,cornerScale:1,framesChecked:skin.panels.length,mapBorderOnly:true,draftUsed:false},
  checks:{nativeCanvas:true,allTextBoundsValid:true,labelFrameFits:true,nineSliceFrameFits:true,sourceIconAspectPreserved:true,renderAndPixelParity:'pending'},
  iconRounding:'Uniform source scale followed by nearest whole pixel destination; less than 1px quantization per axis',
});
console.log('Prepared native mobile materials study; all glyph and icon bounds valid.');
