import type { NightConfig, DeviceKind } from '../../../contracts';
import { CHAPTER_TERRAIN_BOUNDS, isLandCircle } from '../../../content/terrain';
import { deviceArea, deviceSprite, spriteBounds, WORLD_SPRITES, worldToScreen } from './worldGeometry';
import type { SpriteSpec } from './worldGeometry';
import type { ChapterWorldAssets, WorldCamera, WorldDevice, WorldPaintOptions } from './worldTypes';

let assetsPromise:Promise<ChapterWorldAssets>|undefined;
export function loadChapterWorldAssets():Promise<ChapterWorldAssets> {
 if(!assetsPromise) {
  const load=(name:string):Promise<HTMLImageElement>=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Не удалось загрузить изображение мира: ${name}`));image.src=`${import.meta.env.BASE_URL}images/preparation/world/${name}`;});
  assetsPromise=Promise.all([load('terrain-coast-irregular-v1.png'),load('lighthouse-main.png'),load('props-atlas.png')]).then(([terrain,lighthouse,props])=>({terrain,lighthouse,props})).catch(error=>{assetsPromise=undefined;throw error;});
 }
 return assetsPromise;
}
const GLYPHS:Record<Exclude<DeviceKind,'cannon'|'barrier'>,readonly string[]>={
 generator:['..#####..','.##...##.','##..#..##','#..###..#','#.#####.#','#..###..#','##..#..##','.##...##.','..#####..'],
 'light-trap':['....#....','...###...','..#.#.#..','.##.#.##.','#########','.##.#.##.','..#.#.#..','...###...','....#....'],
 harpoon:['....#....','...###...','..#####..','....#....','....#....','....#....','...###...','..#####..','.#######.'],
 mortar:['.........','...####..','..##..##.','..##..##.','...####..','...###...','..#####..','.#######.','#########'],
 bell:['...###...','..#...#..','..#...#..','.#.....#.','.#.....#.','#########','....#....','...###...','.........'],
 'repair-lamp':['...###...','..#####..','..#.#.#..','..#####..','...###...','....#....','..#####..','..#...#..','.#######.'],
};
const COLORS:Record<DeviceKind,string>={cannon:'#babbb5',barrier:'#9e9278',generator:'#82c9e6','light-trap':'#dfdc94',harpoon:'#94bcb9',mortar:'#afa59b',bell:'#e4bd76','repair-lamp':'#a7d9a0'};
/** Shared canvas renderer: CSS coordinates, source aspect unchanged, ground y sorting.
 * The dark surround is intentional when an unusually wide viewport exceeds the source. */
export function paintChapterWorld(ctx:CanvasRenderingContext2D,assets:ChapterWorldAssets,config:NightConfig,camera:WorldCamera,options:WorldPaintOptions):void {
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#061c25';ctx.fillRect(0,0,camera.width,camera.height);
 const bounds=CHAPTER_TERRAIN_BOUNDS, a=worldToScreen(camera,bounds.minX,bounds.minY), b=worldToScreen(camera,bounds.maxX,bounds.maxY);
 ctx.drawImage(assets.terrain,a.x,a.y,b.x-a.x,b.y-a.y);
 const ellipse=(x:number,y:number,r:number,color:string,dash:number[]=[],fill?:string)=>{
  const p=worldToScreen(camera,x,y);ctx.beginPath();ctx.ellipse(p.x,p.y,r*camera.zoom,r*camera.zoom*camera.projectionY,0,0,Math.PI*2);ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=1.5;if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.stroke();ctx.setLineDash([]);
 };
 if(options.showRanges){ellipse(0,0,config.spawnRadius,'#9BBCCB',[5,5]);ellipse(0,0,config.beam.range,'#E9C77D',[5,5]);}
 const selected=options.devices.find(d=>d.id===options.selectedDeviceId);
 if(selected) { const area=deviceArea(config,selected);ellipse(area.x,area.y,area.radius,'#e6d795cc',[], '#dcd9a10c'); }
 if(options.paintGround) { ctx.save();options.paintGround(ctx);ctx.restore(); }
 const drawSprite=(image:HTMLImageElement,x:number,y:number,spec:SpriteSpec)=>{
  const projected=spriteBounds(x,y,spec), f=spec.frame;
  ctx.drawImage(image,f.x,f.y,f.width,f.height,camera.x+projected.minX*camera.zoom,camera.y+projected.minY*camera.zoom,(projected.maxX-projected.minX)*camera.zoom,(projected.maxY-projected.minY)*camera.zoom);
 };
 const drawDevice=(d:WorldDevice,preview=false)=>{
  const def=config.devices.definitions[d.kind],p=worldToScreen(camera,d.x,d.y),valid=isLandCircle(config.terrain,d,def.radius);
  if(d.id===options.selectedDeviceId||!valid||preview) ellipse(d.x,d.y,def.radius,(!valid?'#fa8179':'#e9dc9a'),[],!valid?'#dc665a44':undefined);
  ctx.save();
  if (d.consumed || (d.health !== undefined && d.health <= 0)) ctx.globalAlpha *= .4;
  const spec=deviceSprite(d.kind);
  if(spec) drawSprite(assets.props,d.x,d.y,spec);
  else {
   const pixels=GLYPHS[d.kind as keyof typeof GLYPHS],step=4*camera.zoom;
   ctx.fillStyle='#07191dcc';ctx.fillRect(p.x-21*camera.zoom,p.y-38*camera.zoom,42*camera.zoom,40*camera.zoom);
   ctx.fillStyle=COLORS[d.kind];
   for(let row=0;row<pixels.length;row++)for(let col=0;col<pixels[row]!.length;col++)if(pixels[row]![col]==='#')ctx.fillRect(p.x+(col-4.5)*step,p.y+(row-9)*step,step,step);
  }
  ctx.restore();
  if(d.consumed || (d.health !== undefined && d.health <= 0)) {
   ctx.strokeStyle=d.consumed?'#DDB36C':'#F09888';ctx.lineWidth=2;
   ctx.beginPath();ctx.moveTo(p.x-7,p.y-14);ctx.lineTo(p.x+7,p.y);
   if(!d.consumed){ctx.moveTo(p.x+7,p.y-14);ctx.lineTo(p.x-7,p.y);}ctx.stroke();
  }
  if(options.showHealthBars!==false&&d.health!==undefined&&d.maxHealth!==undefined&&d.maxHealth>0&&d.health<d.maxHealth&&!preview) {
   const y=p.y+11*camera.zoom,width=42*camera.zoom;
   ctx.fillStyle='#091716';ctx.fillRect(p.x-width/2-1,y-1,width+2,5);ctx.fillStyle=d.health/d.maxHealth<.35?'#e18975':'#bad1a2';ctx.fillRect(p.x-width/2,y,width*Math.max(0,d.health/d.maxHealth),3);
  }
  if(!valid&&!preview){ctx.fillStyle='#ffb0a0';ctx.font='bold 18px monospace';ctx.fillText('!',p.x+18*camera.zoom,p.y-20*camera.zoom);}
 };
 const sorted: {y:number;draw:()=>void}[]=[{y:110,draw:()=>drawSprite(assets.props,0,110,WORLD_SPRITES.pier)}];
 if(options.drawLighthouse!==false)sorted.push({y:0,draw:()=>drawSprite(assets.lighthouse,0,0,WORLD_SPRITES.lighthouse)});
 if(options.drawDevices!==false)for(const device of options.devices)sorted.push({y:device.y,draw:()=>drawDevice(device)});
 sorted.sort((left,right)=>left.y-right.y);for(const item of sorted)item.draw();
 if(options.preview) {
  const preview=options.preview;const area=deviceArea(config,{id:-1,...preview});
  ellipse(area.x,area.y,area.radius,preview.valid?'#c7dd9a99':'#ef817999',[4,4]);
  ctx.globalAlpha=.65;drawDevice({id:-1,...preview},true);ctx.globalAlpha=1;
  ellipse(preview.x,preview.y,config.devices.definitions[preview.kind].radius,preview.valid?'#d4edab':'#ff8d7f',[],preview.valid?'#9cca7d22':'#d5665c44');
 }
 ctx.restore();
}
