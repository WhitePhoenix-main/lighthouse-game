import { createRequire } from 'node:module';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
const sharp = createRequire(import.meta.url)('sharp');
// Crops use the original reference's pixel coordinate system. The generated
// source sheets preserve that canvas and remove lettering and background.
const items = [
 ['continue-desktop','desktop',[75,510,610,352]],
 ['trials-desktop','desktop',[680,625,443,232]],
 ['new-game-desktop','desktop',[1121,625,465,232]],
 ['back-desktop','mobile',[175,1625,485,140],[275,79]],
 ['continue-mobile','mobile',[10,670,814,510]],
 ['trials-mobile','mobile',[30,1190,780,210]],
 ['new-game-mobile','mobile',[25,1398,790,205]],
 ['back-mobile','mobile',[175,1625,485,140]],
 ['floor-desktop','floor-desktop-reference',[0,730,1672,211]],
 ['floor-mobile','floor-mobile-reference',[0,1100,841,770]],
];
for (const dir of ['sprites/game-menu','public/images/game-menu']) await mkdir(dir,{recursive:true});
const manifest={states:['idle','hover','pressed','disabled'],sprites:{}};
for (const [name,sheet,crop,size] of items) {
 const [left,top,width,height]=crop;
 const [w,h]=size || [width,height];
 let pipeline=sharp(`art/game-menu-v2/${sheet}.png`).extract({left,top,width,height}).resize(w,h,{kernel:'nearest'}).ensureAlpha();
 // Retain only visible foreground in the approved references; anything hidden
 // by a button or occupied by sea remains transparent. Coordinates are local
 // to each crop, so the extraction can be reproduced without generated fill.
 if(name.startsWith('back-')) pipeline=pipeline.composite([{input:Buffer.from(`<svg width="${w}" height="${h}" viewBox="0 0 485 140" preserveAspectRatio="none"><path fill="white" d="M0 0H485V112L477 112L474 119L465 125L452 130H30L16 126L8 120L5 114H0Z"/></svg>`),blend:'dest-in'}]);
 if(name==='floor-mobile') pipeline=pipeline.composite([{input:Buffer.from(`<svg width="841" height="770"><g fill="white">
 <path d="M0 58 L32 58 L64 72 L150 72 L230 76 L320 76 L410 78 L510 76 L620 75 L720 68 L810 56 L841 56 L841 101 L0 101Z"/>
 <path d="M0 290 L65 290 L90 300 L0 305Z M750 290 L841 285 L841 305 L790 303Z"/>
 <path d="M0 495 L75 500 L155 525 L178 555 L178 660 L0 660Z M670 540 L710 505 L760 490 L841 480 L841 660 L663 660Z"/>
 <path d="M0 660 L178 660 L240 674 L300 680 L345 696 L385 716 L430 702 L470 690 L520 690 L570 679 L665 660 L841 660 V770 H0Z"/>
 </g></svg>`),blend:'dest-in'}]);
 if(name==='floor-desktop') pipeline=pipeline.composite([{input:Buffer.from(`<svg width="1672" height="211"><g fill="white">
 <path d="M0 80 L40 55 L90 45 L90 122 L0 130Z M1580 91 L1635 60 L1672 60 L1672 130 L1580 130Z"/>
 <path d="M0 126 L90 126 L110 132 L670 132 L690 127 L1110 127 L1130 128 L1575 128 L1595 124 L1672 124 L1672 211 L0 211Z"/>
 </g></svg>`),blend:'dest-in'}]);
 const base=await pipeline.png().toBuffer();
 const count=name.startsWith('floor-')?1:4;
 const variants=[];
 for(let state=0;state<count;state++) {
  const {data,info}=await sharp(base).raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4) {
   if(state===1) {data[i]=Math.min(255,data[i]*1.1+3);data[i+1]=Math.min(255,data[i+1]*1.08+3);data[i+2]=Math.min(255,data[i+2]*1.05+3);}
   if(state===2) {data[i]*=.78;data[i+1]*=.78;data[i+2]*=.8;}
   if(state===3) {const g=(data[i]+data[i+1]+data[i+2])/3;for(let c=0;c<3;c++) data[i+c]=(data[i+c]*.4+g*.6)*.65;}
  }
  variants.push({input:await sharp(data,{raw:info}).png().toBuffer(),left:state*w,top:0});
 }
 const dest=`sprites/game-menu/${name}.png`;
 await sharp({create:{width:w*count,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(variants).png().toFile(dest);
 await copyFile(dest,`public/images/game-menu/${name}.png`);
 manifest.sprites[name]={frameWidth:w,frameHeight:h,frames:count,source:`art/game-menu-v2/${sheet}.png`,sourceCrop:{left,top,width,height}};
}
for(const dir of ['sprites/game-menu','public/images/game-menu']) await writeFile(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
