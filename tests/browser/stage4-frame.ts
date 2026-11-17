/** Isolated v4 profile: deliberately no global range purchases, no player storage. */
import type { BattleState } from '../../src/contracts';
import { emptySave, decodeSave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { mountGame } from '../../src/presentation/game';
const seed=emptySave();
const {devices:_devices,nextDeviceId:_id,...profile}=seed.profile;
Object.assign(profile,{resources:10000,bossMaterials:100,legacyEquipment:true,purchasedUpgrades:['unlock-cannon','unlock-barrier','unlock-generator'],wonNightIds:['first-light','broken-shore','winged-tide','abyss-warden'],completedNights:4,bossLevel:2});
let saved=JSON.stringify({...seed,version:4,profile}),id=0;
// Migrate the isolated old profile, then stage wear carried over from a previous night.
const migrated=decodeSave(saved);migrated.profile.devices.find(device=>device.kind==='cannon')!.health=50;saved=JSON.stringify(migrated);
const app=new LighthouseApplication({read:()=>saved,write:raw=>{saved=raw;}},NIGHT_CONFIG,()=>({id:'stage4-'+ ++id,seed:42}),{read:()=>JSON.stringify({version:3,language:'ru',textSize:'normal',soundEnabled:false,musicVolume:0,effectsVolume:0}),write:()=>{}});
app.openDevelopment();
const advance=app.advance.bind(app);app.advance=()=>{};
const game=mountGame(document.querySelector<HTMLElement>('#app')!,app);
Object.assign(window,{stage4Fixture:{app,saved:()=>JSON.parse(saved),damageScene:()=>{
 const battle=app.view.battle as BattleState,config=app.view.config;
 // Freeze normal content definitions only for positioning. Health matches the displayed definition.
 config.enemies={...config.enemies,ghost:{...config.enemies.ghost,speed:0}};
 battle.enemies=[{id:800,kind:'ghost',x:325,y:0,health:config.enemies.ghost.health,armor:0,attackCooldown:10000,waveIndex:0}];
 battle.waves.forEach((wave,index)=>{wave.started=true;wave.spawned=config.waves[index]!.enemies.length;});battle.nextWaveAt=Infinity;
 const target=battle.devices.find(d=>d.kind==='cannon')!;target.health-=15;
 battle.beamAngle=0;app.command({type:'aim',angle:0});
 return {id:target.id,before:target.health,ceiling:target.startHealth,lampIds:battle.devices.filter(d=>d.kind==='repair-lamp').map(d=>d.id),enemyHealth:config.enemies.ghost.health};
},steps:(count:number)=>{for(let i=0;i<count;i++)advance(app.view.config.stepSeconds*1000);}}});
import.meta.hot?.dispose(()=>game.destroy());
