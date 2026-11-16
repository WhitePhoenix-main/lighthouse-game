import { createRequire } from 'node:module';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const source = 'art/game-menu-v1/source.png';
const items = [
 ['continue-desktop',256,128,[45,38,720,362]],
 ['trials-desktop',224,96,[800,100,700,290]],
 ['new-game-desktop',224,96,[45,438,670,278]],
 ['continue-mobile',320,136,[744,510,755,174]],
 ['secondary-mobile',320,64,[744,510,755,174]],
 ['back',48,40,[130,786,180,170]],
 ['floor-desktop',768,108,[425,800,1060,166]],
];
for (const d of ['sprites/game-menu','public/images/game-menu']) await mkdir(d,{recursive:true});
const manifest = {source, reference:'art/play-screen-exploration-2026-11-16/03-tidal-stones-engraved.png', states:['idle','hover','pressed','disabled'], sprites:{}};
for (const [name,w,h,crop] of items) {
 const [left,top,width,height]=crop;
 const {data,info}=await sharp(source).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // Remove generated translucent ambient glow, preserve opaque artwork.
 for(let i=0;i<data.length;i+=4) { const a=data[i+3]; data[i+3]=a<220?0:Math.min(255,Math.round((a-220)*255/34)); }
 const base=await sharp(data,{raw:info}).resize(w,h,{fit:'fill',kernel:'nearest'}).png().toBuffer();
 const variants=[];
 for(let state=0;state<(name==='floor-desktop'?1:4);state++) {
  const {data:p,info:q}=await sharp(base).raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<p.length;i+=4) {
   if(state===1 && p[i]>p[i+2]*1.12) {p[i]=Math.min(255,p[i]*1.12+5);p[i+1]=Math.min(255,p[i+1]*1.08+3);}
   if(state===2) {p[i]*=.78;p[i+1]*=.78;p[i+2]*=.8;}
   if(state===3) {let g=(p[i]+p[i+1]+p[i+2])/3;p[i]=(p[i]*.4+g*.6)*.65;p[i+1]=(p[i+1]*.4+g*.6)*.65;p[i+2]=(p[i+2]*.4+g*.6)*.65;}
  }
  variants.push({input:await sharp(p,{raw:q}).png().toBuffer(),left:state*w,top:0});
 }
 const dest=`sprites/game-menu/${name}.png`;
 await sharp({create:{width:w*variants.length,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(variants).png().toFile(dest);
 await copyFile(dest,`public/images/game-menu/${name}.png`);
 manifest.sprites[name]={frameWidth:w,frameHeight:h,frames:variants.length,sourceCrop:{left,top,width,height}};
}
for(const d of ['sprites/game-menu','public/images/game-menu']) await writeFile(`${d}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
