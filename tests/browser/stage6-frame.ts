/** Isolated v5 ammunition migration and deterministic combat; never player storage. */
import type { BattleState } from '../../src/contracts';
import { emptySave } from '../../src/application/saves';
import { LighthouseApplication } from '../../src/application/gameApplication';
import { NIGHT_CONFIG } from '../../src/content/night';
import { UPGRADES } from '../../src/content/upgrades';
import { mountGame } from '../../src/presentation/game';
const seed=emptySave();
const newIds=['harpoon-damage-2','harpoon-speed-2','harpoon-slow','harpoon-flying','trap-damage-1','trap-damage-2','trap-radius-1','trap-radius-2','trap-health','trap-armor','trap-second-charge'];
Object.assign(seed.profile,{resources:10000,bossMaterials:100,purchasedUpgrades:UPGRADES.filter(n=>!newIds.includes(n.id)).map(n=>n.id),wonNightIds:['first-light','broken-shore','winged-tide','abyss-warden'],completedNights:4,bossLevel:2,devices:[{id:1,kind:'harpoon',health:30,consumed:false,position:null},{id:2,kind:'light-trap',health:15,consumed:false,position:null}],nextDeviceId:3});
for(const kind of ['cannon','barrier','generator','mortar','bell','repair-lamp'] as const)seed.profile.devices.push({id:seed.profile.nextDeviceId++,kind,health:NIGHT_CONFIG.devices.definitions[kind].health,consumed:false,position:null});
let saved=JSON.stringify({...seed,version:5}),id=0;
const app=new LighthouseApplication({read:()=>saved,write:raw=>{saved=raw;}},NIGHT_CONFIG,()=>({id:'stage6-'+ ++id,seed:42}),{read:()=>JSON.stringify({version:3,language:'ru',textSize:'normal',soundEnabled:false,musicVolume:0,effectsVolume:0}),write:()=>{}});
app.openDevelopment();const advance=app.advance.bind(app);app.advance=()=>{};
const game=mountGame(document.querySelector<HTMLElement>('#app')!,app);
function battle(){return app.view.battle as BattleState;}
Object.assign(window,{stage6Fixture:{app,saved:()=>JSON.parse(saved),completeExceptCapacity:()=>{for(const node of UPGRADES)if(node.id!=='trap-second-charge')app.purchaseUpgrade(node.id);},scene:()=>{
 const b=battle(),config=app.view.config;
 config.enemies={...config.enemies,ghost:{...config.enemies.ghost,health:1000,speed:0,attackDamage:0},bat:{...config.enemies.bat,health:1000,speed:0,attackDamage:0}};
 b.enemies=[{id:800,kind:'ghost',x:-200,y:80,health:1000,armor:0,attackCooldown:10000,waveIndex:0}];
 b.waves.forEach((wave,index)=>{wave.started=true;wave.spawned=config.waves[index]!.enemies.length;});b.nextWaveAt=Infinity;
 b.beamAngle=0;app.command({type:'aim',angle:0});
 return {harpoon:b.devices.find(d=>d.kind==='harpoon')!.id,trap:b.devices.find(d=>d.kind==='light-trap')!.id};
},trapScene:()=>{const b=battle(),t=b.devices.find(d=>d.kind==='light-trap')!;b.devices.find(d=>d.kind==='harpoon')!.attackCooldown=10000;b.enemies=[{id:801,kind:'ghost',x:t.x-10,y:t.y,health:1000,armor:0,attackCooldown:10000,waveIndex:0}];},harpoonScene:()=>{const b=battle(),h=b.devices.find(d=>d.kind==='harpoon')!;h.attackCooldown=0;b.enemies=[{id:802,kind:'bat',x:h.x-100,y:h.y,health:1000,armor:0,attackCooldown:10000,waveIndex:0}];},damage:()=>{battle().devices.forEach(d=>d.health/=2);},finish:()=>{battle().outcome='defeat';advance(app.view.config.stepSeconds*1000);},steps:(count:number)=>{for(let i=0;i<count;i++)advance(app.view.config.stepSeconds*1000);}}});
import.meta.hot?.dispose(()=>game.destroy());
