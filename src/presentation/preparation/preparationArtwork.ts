import {drawSettingsPixelText,settingsTextWidth} from '../shared/settingsLettering';

type Glyphs=Record<string,readonly string[]>;
let extraGlyphs:Glyphs={};
let glyphPromise:Promise<void>|undefined;
export function loadPreparationLettering():Promise<void>{
  glyphPromise??=fetch(`${import.meta.env.BASE_URL}images/preparation/ui/glyphs.json`).then(async response=>{if(!response.ok)throw Error('Preparation lettering unavailable');extraGlyphs=await response.json() as Glyphs;}).catch(()=>{glyphPromise=undefined;});
  return glyphPromise;
}
/** Shared menu letterforms, with local punctuation/Cyrillic additions from the approved reference. */
export function drawPreparationText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,scale:number,color:string):boolean{
  for(let index=0;index<text.length;index++){
    const character=text[index]!;if(character===' ')continue;
    const left=x+index*9*scale;
    try{drawSettingsPixelText(ctx,character,left,y,scale,color);}
    catch{
      const rows=extraGlyphs[character];if(!rows)return false;
      for(const [dx,dy,ink] of [[1,2,'#04101C'],[0,0,color]] as const){ctx.fillStyle=ink;for(let r=0;r<9;r++)for(let c=0;c<8;c++)if(rows[r]?.[c]==='1')ctx.fillRect(left+c*scale+dx,y+r*scale+dy,scale,scale);}
    }
  }
  return true;
}
export function paintPreparationLabels(root:HTMLElement):void{
  const dpr=Math.min(3,window.devicePixelRatio||1);
  for(const label of root.querySelectorAll<HTMLElement>('[data-prep-label]')){
    const span=label.querySelector('span'),canvas=label.querySelector('canvas');if(!span||!canvas)continue;
    const box=label.getBoundingClientRect();if(box.width<1||box.height<1)continue;
    const text=(span.textContent??'').toLocaleUpperCase(),style=getComputedStyle(label),size=parseFloat(style.fontSize)||16;
    // Long translated names may wrap naturally in the DOM. Keep that readable fallback
    // instead of shrinking an entire poster or clipping a pixel label.
    const scale=Math.min(size/9,(box.width-2)/Math.max(1,text.length*9-1));
    if(scale<1.1){label.classList.remove('prep-pixel-ready');continue;}
    canvas.width=Math.ceil(box.width*dpr);canvas.height=Math.ceil(box.height*dpr);
    const ctx=canvas.getContext('2d');if(!ctx)continue;ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=false;
    const x=Math.max(0,(box.width-settingsTextWidth(text,scale))/2),y=Math.max(text.includes('Й')?3*scale:0,(box.height-9*scale-2)/2);
    if(y+9*scale+2>box.height){label.classList.remove('prep-pixel-ready');continue;}
    label.classList.toggle('prep-pixel-ready',drawPreparationText(ctx,text,x,y,scale,style.color));
  }
}
