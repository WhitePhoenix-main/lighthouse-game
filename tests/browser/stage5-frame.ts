/** Isolated old profile and deterministic combat scenarios, never player storage. */
import type { BattleState } from '../../src/contracts';
import { emptySave,decodeSave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { UPGRADES } from '../../src/content/upgrades';
import { mountGame } from '../../src/presentation/game';
const seed=emptySave();const {devices:_devices,nextDeviceId:_id,...profile}=seed.profile;
Object.assign(profile,{resources:10000,bossMaterials:100,legacyEquipment:true,purchasedUpgrades:['unlock-cannon','unlock-barrier','unlock-generator'],wonNightIds:['first-light','broken-shore','winged-tide','abyss-warden'],completedNights:4,bossLevel:2});
const migrated=decodeSave(JSON.stringify({...seed,version:4,profile}));
for(const device of migrated.profile.devices)device.health*=.5;
let saved=JSON.stringify(migrated),id=0;
const app=new LighthouseApplication({read:()=>saved,write:raw=>{saved=raw;}},NIGHT_CONFIG,()=>({id:'stage5-'+ ++id,seed:42}),{read:()=>JSON.stringify({version:3,language:'ru',textSize:'normal',soundEnabled:false,musicVolume:0,effectsVolume:0}),write:()=>{}});
app.openDevelopment();const advance=app.advance.bind(app);app.advance=()=>{};
const game=mountGame(document.querySelector<HTMLElement>('#app')!,app);
Object.assign(window,{stage5Fixture:{app,saved:()=>JSON.parse(saved),completeBranches:()=>{for(const node of UPGRADES)app.purchaseUpgrade(node.id);},scene:()=>{
 const battle=app.view.battle as BattleState,config=app.view.config;
 config.enemies={...config.enemies,ghost:{...config.enemies.ghost,health:1000,speed:0}};
 battle.enemies=[{id:800,kind:'ghost',x:-210,y:0,health:1000,armor:0,attackCooldown:10000,waveIndex:0}];
 battle.waves.forEach((wave,index)=>{wave.started=true;wave.spawned=config.waves[index]!.enemies.length;});battle.nextWaveAt=Infinity;
 battle.beamAngle=0;app.command({type:'aim',angle:0});
 return {cannon:battle.devices.find(d=>d.kind==='cannon')!.id,generator:battle.devices.find(d=>d.kind==='generator')!.id};
},readyShot:()=>{app.view.battle!.devices.find(d=>d.kind==='cannon')!.attackCooldown=0;},generatorScene:()=>{
 const battle=app.view.battle as BattleState,config=app.view.config,generator=battle.devices.find(d=>d.kind==='generator')!;
 config.enemies={...config.enemies,ghost:{...config.enemies.ghost,attackDamage:10000}};
 battle.shield.current=0;battle.shield.recoveryRemaining=100;
 battle.enemies=[{id:801,kind:'ghost',x:generator.x-5,y:generator.y,health:1000,armor:0,attackCooldown:0,waveIndex:0}];
},readyAttack:()=>{app.view.battle!.enemies[0]!.attackCooldown=0;},steps:(count:number)=>{for(let i=0;i<count;i++)advance(app.view.config.stepSeconds*1000);}}});
import.meta.hot?.dispose(()=>game.destroy());
