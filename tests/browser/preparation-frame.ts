import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { mountGame } from '../../src/presentation/game';
import { bindLifecycle } from '../../src/platform/browser';
import { createWorldCamera, worldToScreen, spriteBounds, WORLD_SPRITES, deviceSprite } from '../../src/presentation/shared/world/worldGeometry';
import { loadChapterWorldAssets } from '../../src/presentation/shared/world/chapterWorld';
const params=new URLSearchParams(location.search),save=emptySave();
if(!params.has('new')){
 save.profile.resources=136;save.profile.bossMaterials=3;
 save.profile.wonNightIds=['first-light','broken-shore'];
 if(params.has('clear-shore')){
  save.profile.wonNightIds.push('winged-tide','abyss-warden','far-shore');
  save.profile.bossLevel=2;
 }
 save.profile.purchasedUpgrades=['unlock-cannon','unlock-barrier','unlock-flash'];
 save.profile.devices=[
  {id:1,kind:'cannon',health:35,consumed:false,position:{x:params.has('invalid')?100:-140,y:-140}},
  {id:2,kind:'cannon',health:42,consumed:false,position:{x:-140,y:140}},
  {id:3,kind:'barrier',health:140,consumed:false,position:{x:-230,y:0}},
  {id:4,kind:'cannon',health:70,consumed:false,position:null},
 ];save.profile.nextDeviceId=5;
 if(params.has('stock')){save.profile.purchasedUpgrades.push('unlock-trap');save.profile.devices.push({id:5,kind:'light-trap',health:30,consumed:true,trapCharges:0,position:null});save.profile.nextDeviceId=6;}
}
let raw:string|null=params.has('new')?null:JSON.stringify(save),writes=0,fail=false,identity=0;
const settings={version:3,language:params.has('en')?'en':'ru',textSize:params.has('large')?'large':'normal',soundEnabled:false,musicVolume:0,effectsVolume:0};
const catalog = params.has('long-chapter') ? NIGHT_CATALOG.map(night => ['far-shore','armored-front'].includes(night.id)
  ? {...night, chapter: NIGHT_CATALOG[0]!.chapter, optional:false} : night) : NIGHT_CATALOG;
const app=new LighthouseApplication({read:()=>raw,write(value){if(fail)throw Error('fixture quota');raw=value;writes++;}},NIGHT_CONFIG,()=>({id:`preparation-fixture-${++identity}`,seed:42}),{read:()=>JSON.stringify(settings),write:()=>{}},catalog);
if (params.has('game-menu')) app.openGameMenu();
else app.openPreparation();
const fixture={app,writes:()=>writes,raw:()=>raw,fail(value:boolean){fail=value;},assetsReady:false,worldPoint(x:number,y:number){
 const root=document.querySelector<HTMLElement>('.preparation-screen')!,field=root.querySelector<HTMLElement>('[data-prep-field]')!,b=root.getBoundingClientRect(),f=field.getBoundingClientRect();
 const devices=app.view.preparation.placements;
 const id=Number(root.querySelector('.prep-inspector [data-device-id]')?.getAttribute('data-device-id'));
 const camera=JSON.parse(root.querySelector<HTMLCanvasElement>('[data-prep-world]')!.dataset.worldCamera||'null')??createWorldCamera(app.view.config,b.width,b.height,{viewport:{x:f.x-b.x,y:f.y-b.y,width:f.width,height:f.height},devices,selected:devices.find(d=>d.id===id)??null,mode:app.view.preparation.selectedType?'overview':root.querySelector('[data-prep-action="zoom"]')?.getAttribute('aria-pressed')==='true'?'close':'overview',padding:16});
 const p=worldToScreen(camera,x,y);return{x:p.x+b.x,y:p.y+b.y,camera};
},sceneBoxes(){
 const root=document.querySelector<HTMLElement>('.preparation-screen')!,b=root.getBoundingClientRect(),canvas=root.querySelector<HTMLCanvasElement>('[data-prep-world]')!,camera=JSON.parse(canvas.dataset.worldCamera!);
 const items=[{id:'lighthouse',x:0,y:0,spec:WORLD_SPRITES.lighthouse},...app.view.preparation.placements.map(d=>({...d,spec:deviceSprite(d.kind)}))];
 return items.map(item=>{const bounds=item.spec?spriteBounds(item.x,item.y,item.spec):{minX:item.x-21,maxX:item.x+21,minY:item.y*.7-38,maxY:item.y*.7+2};return{id:item.id,x:b.x+camera.x+bounds.minX*camera.zoom,y:b.y+camera.y+bounds.minY*camera.zoom,w:(bounds.maxX-bounds.minX)*camera.zoom,h:(bounds.maxY-bounds.minY)*camera.zoom};});
}};
Object.assign(window,{preparationFixture:fixture});
void loadChapterWorldAssets().then(()=>{fixture.assetsReady=true;});
const unbind=bindLifecycle(app),game=mountGame(document.querySelector<HTMLElement>('#app')!,app);
import.meta.hot?.dispose(()=>{unbind();game.destroy();});
