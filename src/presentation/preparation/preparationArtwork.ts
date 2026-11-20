import {drawSettingsPixelText} from '../shared/settingsLettering';
import {watchAsset} from '../shared/watchArtwork';

export const preparationEscape = (text:string):string => text.replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]!);
export const prepLabel = (text:string,secondary=false):string =>
  `<span class="prep-label${secondary?' prep-secondary':''}" data-prep-label><span>${preparationEscape(text)}</span></span>`;

export const watchPrepAsset = (folder: 'ui' | 'world' | 'illustrations', name: string): string =>
  watchAsset(`${folder}/${name}`);

export const watchPrepIcon = (name: string): string =>
  `<img class="prep-icon" src="${watchPrepAsset('ui', `icon-${name}`)}" alt="" draggable="false">`;

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
      for(const [dx,dy,ink] of [[1,2,'#04101c'],[0,0,color]] as const){ctx.fillStyle=ink;for(let r=0;r<9;r++)for(let c=0;c<8;c++)if(rows[r]?.[c]==='1')ctx.fillRect(left+c*scale+dx,y+r*scale+dy,scale,scale);}
    }
  }
  return true;
}
