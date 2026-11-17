import type {DeviceKind,GameApplication} from '../../contracts';
import {loadChapterWorldAssets,paintChapterWorld} from '../shared/world/chapterWorld';
import {createWorldCamera,screenToWorld,worldToScreen} from '../shared/world/worldGeometry';
import type {ChapterWorldAssets,WorldCamera,WorldDevice} from '../shared/world/worldTypes';
import type {PreparationPanel,PreparationUiState} from './preparationState';
import {preparationKinds,preparationInvalidPlacements} from './preparationScreen';
import {loadPreparationLettering,paintPreparationLabels} from './preparationArtwork';
import {translate} from '../shared/localization';

export interface PreparationControls {sync():void;capture():void;escape():boolean;destroy():void}
export function preparationGestureIsTap(dx:number,dy:number):boolean{return Math.hypot(dx,dy)<=8;}
export function mountPreparationControls(root:HTMLElement,application:GameApplication,state:PreparationUiState,render:()=>void):PreparationControls{
  let assets:ChapterWorldAssets|null=null,camera:WorldCamera|null=null,destroyed=false,frame=0,observed:HTMLElement|null=null;
  let pointer:{id:number;x:number;y:number;dragged:boolean}|null=null;
  let keyPoint={x:-100,y:0};let drawerScroll=0,focusKey='',focusId='',previousScreen:HTMLElement|null=null;
  let returnPanel:PreparationPanel=null,restorePanelFocus=false;
  let lastPaintKey='',lastPaintNode:HTMLElement|null=null,lastConfig:typeof application.view.config|null=null,letteringReady=false;
  const screen=()=>root.querySelector<HTMLElement>('.preparation-screen');
  const devices=():WorldDevice[]=>application.view.preparation.placements.map(p=>{const owned=application.view.preparation.inventory.find(d=>d.id===p.id);return{...p,health:owned?.health,maxHealth:owned?.maxHealth,consumed:owned?.consumed};});
  const schedule=()=>{if(!frame&&!destroyed)frame=requestAnimationFrame(()=>{frame=0;sync();});};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  const closePanel=()=>{restorePanelFocus=true;state.panel=null;render();};
  const cancelPlacement=()=>{application.selectDevice(null);state.placementDeviceId=null;};
  function capture():void{
    const current=screen();if(!current)return;
    drawerScroll=current.querySelector<HTMLElement>('[data-prep-scroll]')?.scrollTop??0;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(focused&&current.contains(focused)){focusKey=focused.dataset.prepAction??focused.dataset.action??(focused.matches('[data-prep-world]')?'world':'');focusId=focused.dataset.deviceId??focused.dataset.panel??'';}
  }
  function sync():void{
    if(destroyed)return;const current=screen();if(!current||application.view.screen!=='preparation'){observer?.disconnect();observed=null;pointer=null;return;}
    if(observed!==current){observer?.disconnect();observer?.observe(current);observed=current;}
    if(previousScreen!==current){
      const drawer=current.querySelector<HTMLElement>('[data-prep-scroll]');if(drawer)drawer.scrollTop=drawerScroll;
      if(restorePanelFocus&&!drawer){current.querySelector<HTMLElement>(`button[data-prep-action="panel"][data-panel="${returnPanel}"]`)?.focus({preventScroll:true});restorePanelFocus=false;}
      else if(drawer&&!previousScreen?.querySelector('[data-prep-scroll]'))drawer.querySelector<HTMLElement>('button')?.focus({preventScroll:true});
      else if(focusKey){const match=[...current.querySelectorAll<HTMLElement>('button,[data-prep-world]')].find(e=>(e.dataset.prepAction??e.dataset.action??(e.matches('[data-prep-world]')?'world':''))===focusKey&&(e.dataset.deviceId??e.dataset.panel??'')===focusId);match?.focus({preventScroll:true});}
      previousScreen=current;
    }
    const canvas=current.querySelector<HTMLCanvasElement>('[data-prep-world]'),field=current.querySelector<HTMLElement>('[data-prep-field]');if(!canvas||!field)return;
    const bounds=current.getBoundingClientRect(),viewport=field.getBoundingClientRect(),width=bounds.width,height=bounds.height;if(width<=0||height<=0)return;
    const dpr=Math.min(3,window.devicePixelRatio||1);
    const paintKey=JSON.stringify({width,height,dpr,viewport:[viewport.left-bounds.left,viewport.top-bounds.top,viewport.width,viewport.height],state,assets:!!assets,letteringReady,text:current.textContent,preview:application.view.preparation.preview,inventory:application.view.preparation.inventory,placements:application.view.preparation.placements});
    if(lastPaintNode===current&&lastConfig===application.view.config&&lastPaintKey===paintKey)return;
    lastPaintNode=current;lastConfig=application.view.config;lastPaintKey=paintKey;
    paintPreparationLabels(current);
    const backingWidth=Math.round(width*dpr),backingHeight=Math.round(height*dpr);
    if(canvas.width!==backingWidth)canvas.width=backingWidth;if(canvas.height!==backingHeight)canvas.height=backingHeight;
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.imageSmoothingEnabled=false;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const entries=devices(),selected=entries.find(d=>d.id===state.selectedDeviceId)??null;
    const cameraPadding=16;
    const tools=current.querySelector<HTMLElement>('.prep-tools')?.getBoundingClientRect();
    const reserved=height>width&&viewport.height<340&&tools?Math.max(0,tools.bottom-viewport.top+8-cameraPadding):0;
    camera=createWorldCamera(application.view.config,width,height,{viewport:{x:viewport.left-bounds.left,y:viewport.top-bounds.top+reserved,width:viewport.width,height:Math.max(40,viewport.height-reserved)},mode:application.view.preparation.selectedType?'overview':state.cameraMode,selected,devices:entries,padding:cameraPadding});
    canvas.dataset.worldCamera=JSON.stringify(camera);
    canvas.dataset.worldReady=String(assets!==null);
    ctx.fillStyle='#08131D';ctx.fillRect(0,0,width,height);
    if(assets){const preview=application.view.preparation.preview,kind=application.view.preparation.selectedType;paintChapterWorld(ctx,assets,application.view.config,camera,{devices:entries,selectedDeviceId:state.selectedDeviceId,showRanges:true,preview:preview&&kind?{...preview,kind}:null});}
    for(const invalid of preparationInvalidPlacements(application.view)){
      const device=entries.find(d=>d.id===invalid.id);if(!device)continue;const p=worldToScreen(camera,device.x,device.y);ctx.strokeStyle='#FF988F';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-12,p.y-12);ctx.lineTo(p.x+12,p.y+12);ctx.moveTo(p.x+12,p.y-12);ctx.lineTo(p.x-12,p.y+12);ctx.stroke();
    }
    const feedback=current.querySelector<HTMLElement>('[data-prep-feedback]');if(feedback&&application.view.preparation.selectedType){const preview=application.view.preparation.preview;feedback.hidden=false;if(preview)feedback.textContent=translate(preview.valid?'Можно установить. Нажми на поле или Enter.':preview.reason,document.documentElement.lang==='en'?'en':'ru');}
  }
  function target(event:Event):HTMLElement|null{return event.target instanceof Element?event.target.closest<HTMLElement>('.preparation-screen [data-prep-action],.preparation-screen [data-action]'):null;}
  function click(event:Event):void{
    const button=target(event);if(!button||!root.contains(button))return;
    event.stopPropagation();if(button instanceof HTMLButtonElement&&button.disabled)return;
    const action=button.dataset.prepAction??button.dataset.action;if(!action)return;
    capture();
    if(action==='panel'){state.panel=button.dataset.panel as PreparationPanel;returnPanel=state.panel;drawerScroll=0;render();return;}
    if(action==='close-panel'){closePanel();return;}
    if(action==='zoom'){state.cameraMode=state.cameraMode==='close'?'overview':'close';render();return;}
    if(action==='deselect'){state.selectedDeviceId=null;render();return;}
    if(action==='cancel-placement'){cancelPlacement();render();return;}
    if(application.view.error)return;
    const view=application.view,id=Number(button.dataset.deviceId),kind=button.dataset.kind as DeviceKind;
    switch(action){
      case 'back':cancelPlacement();state.panel=null;application.openGameMenu();break;
      case 'development':application.openDevelopment();break;
      case 'start':if(view.preparation.canStart&&!preparationInvalidPlacements(view).length)application.start();break;
      case 'device-type':if(preparationKinds.includes(kind)){state.placementDeviceId=null;application.selectDevice(view.preparation.selectedType===kind?null:kind);state.cameraMode='overview';if(application.view.preparation.selectedType)state.panel=null;}break;
      case 'owned-device':case 'move-device':{const owned=view.preparation.inventory.find(d=>d.id===id);if(owned){state.placementDeviceId=id;state.selectedDeviceId=id;state.cameraMode='overview';application.selectDevice(owned.kind);state.panel=null;keyPoint=owned.position?{...owned.position}:{x:-100,y:0};}}break;
      case 'purchase-device':if(preparationKinds.includes(kind))application.purchaseDevice(kind);break;
      case 'repair-device':application.repairDevice(id);break;
      case 'recharge-device':application.rechargeDevice(id);break;
      case 'remove-device':application.removeDevice(id);if(state.selectedDeviceId===id)state.selectedDeviceId=null;if(state.placementDeviceId===id)cancelPlacement();break;
      case 'clear-devices':application.clearPlacements();state.selectedDeviceId=null;cancelPlacement();break;
      case 'select-night':{const night=view.nights.find(n=>n.id===button.dataset.night);if(night?.available){application.selectNight(night.id);cancelPlacement();}}break;
      case 'select-lens':{const lens=view.lenses.find(l=>l.definition.id===button.dataset.lens);if(lens?.unlocked)application.selectLens(lens.definition.id);}break;
      case 'select-late-mode':{const mode=view.lateNightModes?.find(m=>m.id===button.dataset.mode);if(mode)application.selectLateMode(mode.id);}break;
    }
    render();
  }
  const canvasTarget=(event:Event)=>event.target instanceof HTMLCanvasElement&&event.target.matches('[data-prep-world]');
  function point(event:PointerEvent):{x:number;y:number}|null{
    const current=screen(),field=current?.querySelector<HTMLElement>('[data-prep-field]');if(!current||!field||!camera||state.panel)return null;const f=field.getBoundingClientRect();if(event.clientX<f.left||event.clientY<f.top||event.clientX>f.right||event.clientY>f.bottom)return null;const b=current.getBoundingClientRect();return screenToWorld(camera,event.clientX-b.left,event.clientY-b.top);
  }
  function preview(x:number,y:number):void{if(application.view.error)return;keyPoint={x,y};application.previewPlacement(x,y,state.placementDeviceId??undefined);sync();}
  function place(x:number,y:number):void{if(application.view.error)return;const check=application.previewPlacement(x,y,state.placementDeviceId??undefined);if(check.valid){application.placeDevice(x,y,state.placementDeviceId??undefined);if(!application.view.error&&state.placementDeviceId!==null){state.selectedDeviceId=state.placementDeviceId;state.placementDeviceId=null;application.selectDevice(null);}}render();}
  function down(event:PointerEvent):void{if(!canvasTarget(event)||event.button!==0||!point(event))return;event.stopPropagation();pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};}
  function move(event:PointerEvent):void{if(!canvasTarget(event))return;const p=point(event);if(pointer&&pointer.id===event.pointerId&&!preparationGestureIsTap(event.clientX-pointer.x,event.clientY-pointer.y))pointer.dragged=true;if(p&&application.view.preparation.selectedType&&event.pointerType!=='touch')preview(p.x,p.y);}
  function up(event:PointerEvent):void{
    if(!canvasTarget(event)||pointer?.id!==event.pointerId)return;event.stopPropagation();const gesture=pointer;pointer=null;const p=point(event);if(!p||gesture.dragged||!preparationGestureIsTap(event.clientX-gesture.x,event.clientY-gesture.y))return;
    if(application.view.preparation.selectedType)place(p.x,p.y);else{const hit=devices().map(d=>({d,distance:Math.hypot((d.x-p.x)*camera!.zoom,(d.y-p.y)*camera!.zoom*camera!.projectionY)})).filter(({d,distance})=>distance<=Math.max(22,application.view.config.devices.definitions[d.kind].radius*camera!.zoom*1.5)).sort((a,b)=>a.distance-b.distance)[0];state.selectedDeviceId=hit?.d.id??null;render();}
  }
  function escape():boolean{if(!screen())return false;if(state.panel){closePanel();return true;}if(application.view.preparation.selectedType){cancelPlacement();render();return true;}if(state.selectedDeviceId!==null){state.selectedDeviceId=null;render();return true;}return false;}
  function key(event:KeyboardEvent):void{
    if(!screen())return;
    if(event.key==='Escape'&&escape()){event.preventDefault();event.stopPropagation();return;}
    const drawer=screen()?.querySelector<HTMLElement>('[role="dialog"]');
    if(drawer&&event.key==='Tab'){const focusable=[...drawer.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}return;}
    if(!canvasTarget(event)||!application.view.preparation.selectedType||application.view.error)return;
    const offsets:Record<string,readonly[number,number]>={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};const offset=offsets[event.key];
    if(offset){event.preventDefault();event.stopPropagation();preview(keyPoint.x+offset[0],keyPoint.y+offset[1]);}else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();place(keyPoint.x,keyPoint.y);}
  }
  const cancel=()=>{pointer=null;};
  root.addEventListener('click',click,true);root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel,true);root.addEventListener('keydown',key,true);window.addEventListener('resize',schedule);
  void loadChapterWorldAssets().then(loaded=>{if(!destroyed){assets=loaded;schedule();}}).catch(()=>{const feedback=screen()?.querySelector<HTMLElement>('[data-prep-feedback]');if(feedback){feedback.hidden=false;feedback.textContent='Не удалось загрузить оформление карты. Перезагрузите страницу.';}});
  void loadPreparationLettering().then(()=>{letteringReady=true;schedule();});
  return{sync,capture,escape,destroy(){destroyed=true;observer?.disconnect();cancelAnimationFrame(frame);root.removeEventListener('click',click,true);root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('keydown',key,true);window.removeEventListener('resize',schedule);}};
}
