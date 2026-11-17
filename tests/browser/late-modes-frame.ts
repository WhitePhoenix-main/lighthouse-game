import type { DeviceKind } from '../../src/contracts';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { emptySave, decodeSave } from '../../src/application/saves';
import { NIGHT_CONFIG } from '../../src/content/night';
import { NIGHT_CATALOG } from '../../src/content/nights';
import { UPGRADES } from '../../src/content/upgrades';
import { LENSES, LENS_UPGRADES } from '../../src/content/lenses';
import { DEVICE_RULES } from '../../src/content/devices';
import { BrowserSaveStore, BrowserSettingsStore, SAVE_KEY, SETTINGS_KEY, bindLifecycle } from '../../src/platform/browser';
import { grantFixtureDevices } from '../helpers/devices';
import { selectBeamTargets } from '../../src/simulation/beam';
import { mountGame } from '../../src/presentation/game';

if (!localStorage.getItem(SAVE_KEY)) {
 const save=emptySave(),p=save.profile;
 Object.assign(p,{resources:10000,bossMaterials:100,bossLevel:3,completedNights:6,
  wonNightIds:NIGHT_CATALOG.filter(n=>!['armored-front','sky-siege','cross-current'].includes(n.id)).map(n=>n.id),
  purchasedUpgrades:UPGRADES.map(n=>n.id),unlockedLenses:LENSES.map(n=>n.id),
  lensUpgrades:LENS_UPGRADES.map(n=>n.id)});
 grantFixtureDevices(p);
 const positions:Partial<Record<DeviceKind,{x:number;y:number}[]>>={
  cannon:[{x:-100,y:-90},{x:-180,y:-180}],harpoon:[{x:-100,y:90},{x:-180,y:180}],
  barrier:[{x:-235,y:0},{x:-235,y:115}],generator:[{x:-70,y:0},{x:-135,y:0}],
 };
 for(const kind of ['cannon','harpoon','barrier','generator'] as const){
  p.devices.find(d=>d.kind===kind)!.position=positions[kind]![0]!;
  p.devices.push({id:p.nextDeviceId++,kind,health:DEVICE_RULES.definitions[kind].health,consumed:false,position:positions[kind]![1]!});
 }
 const trap=p.devices.find(d=>d.kind==='light-trap')!;trap.health*=.5;trap.trapCharges=1;
 localStorage.setItem(SAVE_KEY,JSON.stringify(save));
 localStorage.setItem(SETTINGS_KEY,JSON.stringify({version:3,language:'ru',textSize:'normal',soundEnabled:false,musicVolume:0,effectsVolume:0}));
}
const app=new LighthouseApplication(new BrowserSaveStore(),NIGHT_CONFIG,()=>({id:crypto.randomUUID(),seed:42}),new BrowserSettingsStore(),NIGHT_CATALOG);
app.openPreparation();
const advance=app.advance.bind(app);app.advance=()=>{}; // Deterministic clock only; real battles, commands and persistence.
const disposeLifecycle=bindLifecycle(app);
const game=mountGame(document.querySelector<HTMLElement>('#app')!,app);
function play() {
 let targetId:number|null=null,nextDecision=.7;
 for(let i=0;i<10800&&app.view.screen==='battle'&&!app.view.paused;i++){
  const s=app.view.battle!,c=app.view.config;
  if(s.elapsed>=nextDecision){
   nextDecision+=.7;
   const near=s.enemies.filter(e=>e.health>0&&Math.hypot(e.x,e.y)<=c.flash.radius+c.enemies[e.kind].radius);
   if(near.length>=3||near.some(e=>e.chargePhase==='windup'))app.command({type:'flash'});
   const available=s.enemies.filter(e=>selectBeamTargets(s.enemies,c,Math.atan2(e.y,e.x)).lit.includes(e.id));
   const target=available.find(e=>e.kind==='minotaur'&&(e.chargePhase==='windup'||e.chargePhase==='charging'))
    ??available.find(e=>e.id===targetId)
    ??available.sort((a,b)=>(Math.hypot(a.x,a.y)-c.lighthouseRadius-c.enemies[a.kind].radius)/c.enemies[a.kind].speed
      -(Math.hypot(b.x,b.y)-c.lighthouseRadius-c.enemies[b.kind].radius)/c.enemies[b.kind].speed||a.id-b.id)[0];
   targetId=target?.id??null;
   if(target)app.command({type:'aim',angle:Math.atan2(target.y,target.x)});
  }
  advance(app.view.config.stepSeconds*1000);
 }
 return app.view.result;
}
Object.assign(window,{lateModeFixture:{app,play,saved:()=>decodeSave(localStorage.getItem(SAVE_KEY)!),steps:(count:number)=>{for(let i=0;i<count;i++)advance(app.view.config.stepSeconds*1000);}}});
import.meta.hot?.dispose(()=>{disposeLifecycle();game.destroy();});
