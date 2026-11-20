import type {DeviceKind,GameApplication} from '../../contracts';
import {loadChapterWorldAssets,paintChapterWorld} from '../shared/world/chapterWorld';
import {createWorldCamera,screenToWorld,worldToScreen} from '../shared/world/worldGeometry';
import type {ChapterWorldAssets,WorldCamera,WorldDevice} from '../shared/world/worldTypes';
import type {PreparationPanel,PreparationUiState} from './preparationState';
import {preparationKinds,preparationInvalidPlacements} from './preparationScreen';
import {chroniclePage,openChronicle,selectChronicleChapter} from './chronicleState';
import {translate} from '../shared/localization';
import {campaignChapterIntro} from '../../content/campaignIntros';
import {DEVICE_VARIANTS, type DeviceVariantId} from '../../content/campaignVariants';
import {campaignRewardAction} from '../campaignCollection';
import {campaignLighthouseStage} from '../shared/world/chapterScenery';

export interface PreparationControls {sync():void;capture():void;escape():boolean;destroy():void}
export function preparationGestureIsTap(dx:number,dy:number):boolean{return Math.hypot(dx,dy)<=8;}
export function mountPreparationControls(root:HTMLElement,application:GameApplication,state:PreparationUiState,render:()=>void):PreparationControls{
  let assets:ChapterWorldAssets|null=null,camera:WorldCamera|null=null,destroyed=false,frame=0,observed:HTMLElement|null=null;
  let artworkRequested = false;
  let pointer:{id:number;x:number;y:number;dragged:boolean}|null=null;
  let bookSwipe: {id:number;x:number;y:number;button:HTMLButtonElement|null}|null=null;
  let suppressBookClick = false;
  let keyPoint={x:-100,y:0};let drawerScroll=0,focusKey='',focusId='',previousScreen:HTMLElement|null=null;
  let bookScroll=0;
  let returnPanel:PreparationPanel=null,restorePanelFocus=false;
  let lastPaintKey='',lastPaintNode:HTMLElement|null=null,lastConfig:typeof application.view.config|null=null;
  const screen=()=>root.querySelector<HTMLElement>('.preparation-screen');
  const usesSharedRiftOverview = () => application.view.config.campaignMapId === 'rift-coast' &&
    state.cameraMode === 'overview' && !application.view.preparation.selectedType;
  const devices=():WorldDevice[]=>application.view.preparation.placements.map(p=>{const owned=application.view.preparation.inventory.find(d=>d.id===p.id);return{...p,health:owned?.health,maxHealth:owned?.maxHealth,consumed:owned?.consumed};});
  const schedule=()=>{if(!frame&&!destroyed)frame=requestAnimationFrame(()=>{frame=0;sync();});};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);
  const closePanel=()=>{
    if(application.view.screen==='trials') application.back();
    else {restorePanelFocus=true;state.panel=null;state.chronicle=null;delete state.replayIntroChapter;}
    render();
  };
  const cancelPlacement=()=>{application.selectDevice(null);state.placementDeviceId=null;};
  const focusIdentity=(element:HTMLElement)=>element.dataset.deviceId??element.dataset.panel??element.dataset.chapter??element.dataset.night??element.dataset.page??element.dataset.mode??element.dataset.lens??element.dataset.kind??element.dataset.ability??'';
  function capture():void{
    const current=screen();if(!current)return;
    drawerScroll=current.querySelector<HTMLElement>('[data-prep-scroll]')?.scrollTop??0;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(focused&&current.contains(focused)){focusKey=focused.dataset.prepAction??focused.dataset.action??(focused.matches('[data-prep-world]')?'world':'');focusId=focusIdentity(focused);}
  }
  function sync():void{
    if(destroyed)return;const current=screen();if(!current||!['preparation','trials'].includes(application.view.screen)){
      observer?.disconnect();observed=null;previousScreen=null;pointer=null;bookSwipe=null;artworkRequested=false;return;
    }
    if(observed!==current){observer?.disconnect();observer?.observe(current);observed=current;}
    if(previousScreen!==current){
      const drawer=current.querySelector<HTMLElement>('[role="dialog"]'),scroll=drawer?.querySelector<HTMLElement>('[data-prep-scroll]')??drawer;if(scroll)scroll.scrollTop=drawerScroll;
      if(restorePanelFocus&&!drawer){current.querySelector<HTMLElement>(`button[data-prep-action="panel"][data-panel="${returnPanel}"]`)?.focus({preventScroll:true});restorePanelFocus=false;}
      else if(drawer&&!previousScreen?.querySelector('[role="dialog"]'))(drawer.querySelector<HTMLElement>('[data-chronicle-initial-focus]')??drawer.querySelector<HTMLElement>('button'))?.focus({preventScroll:true});
      else if(focusKey){const match=[...current.querySelectorAll<HTMLElement>('button,[data-prep-world]')].find(e=>(e.dataset.prepAction??e.dataset.action??(e.matches('[data-prep-world]')?'world':''))===focusKey&&focusIdentity(e)===focusId);match?.focus({preventScroll:true});}
      previousScreen=current;
    }
    const canvas=current.querySelector<HTMLCanvasElement>('[data-prep-world]'),field=current.querySelector<HTMLElement>('[data-prep-field]');
    const bounds=current.getBoundingClientRect(),viewport=field?.getBoundingClientRect(),width=bounds.width,height=bounds.height;if(width<=0||height<=0)return;
    const dpr=Math.min(3,window.devicePixelRatio||1);
    const paintKey=JSON.stringify({width,height,dpr,viewport:viewport&&[viewport.left-bounds.left,viewport.top-bounds.top,viewport.width,viewport.height],state,assets:!!assets,preview:application.view.preparation.preview,inventory:application.view.preparation.inventory,placements:application.view.preparation.placements});
    if(lastPaintNode===current&&lastConfig===application.view.config&&lastPaintKey===paintKey)return;
    lastPaintNode=current;lastConfig=application.view.config;lastPaintKey=paintKey;
    if(!canvas||!viewport){artworkRequested=false;return;}
    const campaign = application.view.config.campaignMapId !== undefined;
    if (!assets && !artworkRequested) {
      artworkRequested = true;
      void loadChapterWorldAssets(campaign).then(loaded => {
        if (!destroyed) { assets = loaded; schedule(); }
      }).catch(() => { /* The campaign terrain and device symbols remain available. */ });
    }
    const backingWidth=Math.round(width*dpr),backingHeight=Math.round(height*dpr);
    if(canvas.width!==backingWidth)canvas.width=backingWidth;if(canvas.height!==backingHeight)canvas.height=backingHeight;
    const ctx=canvas.getContext('2d');if(!ctx)return;ctx.imageSmoothingEnabled=false;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const entries=devices(),selected=entries.find(d=>d.id===state.selectedDeviceId)??null;
    const cameraPadding=16;
    const placing = application.view.preparation.selectedType;
    const fullHeadland = application.view.config.campaignMapId === 'headland' && state.cameraMode !== 'close';
    const riftOverview = usesSharedRiftOverview();
    camera=createWorldCamera(application.view.config,width,height,{
      viewport:fullHeadland||riftOverview?undefined:{x:viewport.left-bounds.left,y:viewport.top-bounds.top,width:viewport.width,height:viewport.height},
      mode:placing?'overview':state.cameraMode,selected,devices:entries,padding:fullHeadland||riftOverview?undefined:cameraPadding,
    });
    canvas.dataset.worldCamera=JSON.stringify(camera);
    canvas.dataset.worldReady=String(campaign||assets!==null);
    ctx.fillStyle='#08131D';ctx.fillRect(0,0,width,height);
    if(campaign||assets){
      const {config,profile,preparation}=application.view,preview=preparation.preview,kind=preparation.selectedType;
      paintChapterWorld(ctx,assets,{...config,lighthouseStage:campaignLighthouseStage(profile.wonNightIds??[])},camera,
        {devices:entries,selectedDeviceId:state.selectedDeviceId,showRanges:true,preview:preview&&kind?{...preview,kind}:null});
    }
    for(const invalid of preparationInvalidPlacements(application.view)){
      const device=entries.find(d=>d.id===invalid.id);if(!device)continue;const p=worldToScreen(camera,device.x,device.y);ctx.strokeStyle='#FF988F';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-12,p.y-12);ctx.lineTo(p.x+12,p.y+12);ctx.moveTo(p.x+12,p.y-12);ctx.lineTo(p.x-12,p.y+12);ctx.stroke();
    }
    const feedback=current.querySelector<HTMLElement>('[data-prep-feedback]');if(feedback&&application.view.preparation.selectedType){const preview=application.view.preparation.preview;feedback.hidden=false;if(preview)feedback.textContent=translate(preview.valid?'Можно установить. Нажми на поле или Enter.':preview.reason,document.documentElement.lang==='en'?'en':'ru');}
  }
  function showChronicle(focus?: string, scrollTop?: number): void {
    render();
    const current = screen();
    if (scrollTop !== undefined) current?.querySelector<HTMLElement>('[data-prep-scroll]')?.scrollTo({ top: scrollTop });
    if (focus) current?.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  }
  function showContents(contents: boolean): void {
    const selection = state.chronicle;
    if (!selection) return;
    if (selection.kind === 'trials') {
      if (application.view.screen === 'trials') return;
      const campaign = openChronicle(application.view, 'campaign');
      if (!campaign) return;
      state.chronicle = { ...campaign, contents: true };
    } else {
      if (selection.contents === contents) return;
      selection.contents = contents;
      if (contents) {
        delete selection.previewChapterId;
        delete selection.contentsPage;
      } else if (selection.previewChapterId) {
        state.chronicle = selectChronicleChapter(application.view, selection, selection.previewChapterId);
      }
    }
    showChronicle(state.chronicle?.contents
      ? '[data-prep-action="chronicle-chapter"][aria-current="true"]'
      : '[data-chronicle-initial-focus]', 0);
  }
  function turnPage(page: number, fromSwipe = false): boolean {
    const selection = state.chronicle;
    if (!selection || selection.contents) return false;
    const current = chroniclePage(application.view, selection);
    if (!current || !Number.isInteger(page) || page < 0 || page >= current.pageCount || page === current.page) return false;
    const turn = () => {
      if (destroyed || state.chronicle !== selection) return;
      selection.page = page;
      showChronicle(fromSwipe ? undefined : '[data-chronicle-page]');
    };
    // Keep the current touch target mounted until the browser finishes the gesture.
    if (fromSwipe) requestAnimationFrame(turn);
    else turn();
    return true;
  }
  function handleChronicleAction(action: string, button: HTMLElement): boolean {
    const selection = state.chronicle;
    if (!selection) return false;
    const view = application.view;
    if(action==='close-intro-replay'){
      delete state.replayIntroChapter;showChronicle('[data-prep-action="replay-intro"]', bookScroll);return true;
    }
    if(action==='replay-intro'){
      const chapter=chroniclePage(view,selection)?.chapter;
      const intro=chapter && campaignChapterIntro(chapter.number-1);
      if(chapter&&intro&&chapter.nights.some(item=>item.available)&&view.campaign?.seenIntroIds.includes(intro.id)){
        bookScroll=drawerScroll;
        state.replayIntroChapter=chapter.number;
        showChronicle('[data-prep-action="close-intro-replay"]', 0);
      }
      return true;
    }
    if (action === 'chronicle-contents') showContents(true);
    else if (action === 'chronicle-nights-tab') showContents(false);
    else if (action === 'chronicle-chapter' && selection.kind === 'campaign') {
      selection.previewChapterId = button.dataset.chapter;
      showChronicle();
    } else if (action === 'chronicle-inspect-chapter' && selection.kind === 'campaign') {
      state.chronicle = selectChronicleChapter(view, selection, button.dataset.chapter ?? '');
      showChronicle('[data-prep-action="chronicle-nights-tab"]', 0);
    } else if (action === 'chronicle-trials' && view.screen === 'preparation') {
      const trials = openChronicle(view, 'trials');
      if (trials) {
        state.chronicle = trials;
        showChronicle('[data-chronicle-initial-focus]', 0);
      }
    } else if (action === 'chronicle-page') turnPage(Number(button.dataset.page));
    else if (action === 'chronicle-index-page' && selection.contents) {
      const page = Number(button.dataset.page), chapters = chroniclePage(view, selection)?.chapters ?? [];
      const chapter = Number.isInteger(page) && page >= 0 ? chapters[page * 4] : undefined;
      if (chapter) {
        selection.contentsPage = page;
        selection.previewChapterId = chapter.id;
        showChronicle('[data-prep-action="chronicle-chapter"][aria-current="true"]', 0);
      }
    } else if (action === 'chronicle-night' || action === 'chronicle-preview-night' || action === 'confirm-night') {
      if (view.error || selection.contents) return true;
      const current = chroniclePage(view, selection);
      if (action !== 'confirm-night') {
        const night = current?.nights.find(item => item.id === button.dataset.night);
        if (night) {
          if (night.available) selection.nightId = night.id;
          selection.previewNightId = night.id;
          showChronicle();
        }
      } else if (current?.selected && (!selection.previewNightId || !current.nights.some(item => item.id === selection.previewNightId && !item.available))) {
        const night = current.selected;
        if (view.screen === 'trials') {
          application.selectNight(night.id);
          restorePanelFocus = true;
          returnPanel = 'night';
          render();
        } else {
          if (view.selectedNightId !== night.id) { application.selectNight(night.id); cancelPlacement(); }
          closePanel();
        }
      }
    } else return false;
    return true;
  }
  function target(event:Event):HTMLElement|null{return event.target instanceof Element?event.target.closest<HTMLElement>('.preparation-screen [data-prep-action],.preparation-screen [data-action]'):null;}
  function click(event:Event):void{
    const button=target(event);if(!button||!root.contains(button))return;
    event.stopPropagation();if(button instanceof HTMLButtonElement&&button.disabled)return;
    if(suppressBookClick && event instanceof MouseEvent && event.detail > 0) { suppressBookClick = false; return; }
    const action=button.dataset.prepAction??button.dataset.action;if(!action)return;
    capture();
    if(action==='panel'){
      state.panel=button.dataset.panel as PreparationPanel;
      if (state.panel === 'devices') {
        const selected=devices().find(device=>device.id===state.selectedDeviceId);
        if (selected) state.catalogKind=selected.kind;
      }
      if(state.panel==='shards'||state.panel==='pearls')application.refreshCampaignRewards?.();
      state.chronicle=state.panel==='night'?openChronicle(application.view):null;
      returnPanel=state.panel;drawerScroll=0;render();return;
    }
    if(action==='close-panel'){closePanel();return;}
    if(handleChronicleAction(action, button))return;
    if(action==='browse-device'){
      const kind=button.dataset.kind as DeviceKind;
      if(preparationKinds.includes(kind)) {state.catalogKind=kind;drawerScroll=0;render();}
      return;
    }
    if(action==='zoom'){state.cameraMode=state.cameraMode==='close'?'overview':'close';render();return;}
    if(action==='deselect'){state.selectedDeviceId=null;render();return;}
    if(action==='cancel-placement'){cancelPlacement();render();return;}
    if(application.view.error)return;
    if(campaignRewardAction(application,action,button)){render();return;}
    const view=application.view,id=Number(button.dataset.deviceId),kind=button.dataset.kind as DeviceKind;
    switch(action){
      case 'back':cancelPlacement();state.panel=null;application.openGameMenu();break;
      case 'development':application.openDevelopment();break;
      case 'campaign-collection':application.openCollection?.();break;
      case 'start':if(!view.preparation.selectedType&&view.preparation.canStart&&!preparationInvalidPlacements(view).length)application.start();break;
      case 'device-type':if(preparationKinds.includes(kind)){state.placementDeviceId=null;application.selectDevice(view.preparation.selectedType===kind?null:kind);state.cameraMode='overview';if(application.view.preparation.selectedType)state.panel=null;}break;
      case 'owned-device':case 'move-device':{const owned=view.preparation.inventory.find(d=>d.id===id);if(owned){state.placementDeviceId=id;state.selectedDeviceId=id;state.cameraMode='overview';application.selectDevice(owned.kind);state.panel=null;keyPoint=owned.position?{...owned.position}:{x:-100,y:0};}}break;
      case 'purchase-device':if(preparationKinds.includes(kind)){
        const variant=button.dataset.variant as DeviceVariantId|undefined;
        if(!variant||Object.hasOwn(DEVICE_VARIANTS,variant))application.purchaseDevice(kind,variant);
      }break;
      case 'repair-device':application.repairDevice(id);break;
      case 'recharge-device':application.rechargeDevice(id);break;
      case 'remove-device':application.removeDevice(id);if(state.selectedDeviceId===id)state.selectedDeviceId=null;if(state.placementDeviceId===id)cancelPlacement();break;
      case 'clear-devices':application.clearPlacements();state.selectedDeviceId=null;cancelPlacement();break;
      case 'select-lens':{const lens=view.lenses.find(l=>l.definition.id===button.dataset.lens);if(lens?.unlocked)application.selectLens(lens.definition.id);}break;
      case 'select-ability':{const id=button.dataset.ability;const ability=view.campaign?.abilities.find(entry=>entry.id===id);if(id==='none')application.selectAbility?.(null);else if(ability?.available)application.selectAbility?.(ability.id);}break;
      case 'acknowledge-intro':application.acknowledgeIntro?.();break;
      case 'select-late-mode':{const mode=view.lateNightModes?.find(m=>m.id===button.dataset.mode);if(mode)application.selectLateMode(mode.id);}break;
    }
    render();
    if (!state.panel && application.view.preparation.selectedType && ['device-type','owned-device','move-device'].includes(action)) {
      screen()?.querySelector<HTMLElement>('[data-prep-world]')?.focus({preventScroll:true});
    }
  }
  const canvasTarget=(event:Event)=>event.target instanceof HTMLCanvasElement&&event.target.matches('[data-prep-world]');
  function point(event:PointerEvent):{x:number;y:number}|null{
    const current = screen(), field = current?.querySelector<HTMLElement>('[data-prep-field]');
    if (!current || !field || !camera || state.panel) return null;
    const bounds = current.getBoundingClientRect();
    // The shared overview can show a device beside the header. Only exposed
    // canvas events reach this function; placement still uses the field.
    const hitArea = usesSharedRiftOverview() ? bounds : field.getBoundingClientRect();
    if (event.clientX < hitArea.left || event.clientY < hitArea.top ||
        event.clientX > hitArea.right || event.clientY > hitArea.bottom) return null;
    return screenToWorld(camera, event.clientX - bounds.left, event.clientY - bounds.top);
  }
  function preview(x:number,y:number):void{if(application.view.error)return;keyPoint={x,y};application.previewPlacement(x,y,state.placementDeviceId??undefined);sync();}
  function place(x:number,y:number):void{if(application.view.error)return;const check=application.previewPlacement(x,y,state.placementDeviceId??undefined);if(check.valid){application.placeDevice(x,y,state.placementDeviceId??undefined);if(!application.view.error&&state.placementDeviceId!==null){state.selectedDeviceId=state.placementDeviceId;state.placementDeviceId=null;application.selectDevice(null);}}render();}
  function down(event:PointerEvent):void{
    suppressBookClick = false;
    if (event.pointerType === 'touch' && event.isPrimary && event.target instanceof Element && event.target.closest('[data-chronicle-page]')) {
      bookSwipe = { id: event.pointerId, x: event.clientX, y: event.clientY,
        button: event.target.closest<HTMLButtonElement>('button:not(:disabled)[data-prep-action]') };
      return;
    }
    if(!canvasTarget(event)||event.button!==0||!point(event))return;event.stopPropagation();pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};
  }
  function move(event:PointerEvent):void{if(!canvasTarget(event))return;const p=point(event);if(pointer&&pointer.id===event.pointerId&&!preparationGestureIsTap(event.clientX-pointer.x,event.clientY-pointer.y))pointer.dragged=true;if(p&&application.view.preparation.selectedType&&event.pointerType!=='touch')preview(p.x,p.y);}
  function up(event:PointerEvent):void{
    if (bookSwipe?.id === event.pointerId) {
      const dx = event.clientX - bookSwipe.x;
      const dy = event.clientY - bookSwipe.y;
      const button = bookSwipe.button;
      bookSwipe = null;
      if (state.chronicle && Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        suppressBookClick = turnPage(state.chronicle.page + (dx < 0 ? 1 : -1), true);
      } else if (button && preparationGestureIsTap(dx, dy) && button.contains(document.elementFromPoint(event.clientX, event.clientY))) {
        // Chromium may suppress the native click on the first tap after a swipe.
        suppressBookClick = true;
        requestAnimationFrame(() => {
          if (destroyed || !button.isConnected) return;
          button.focus({preventScroll:true});
          button.click();
        });
      }
      return;
    }
    if(!canvasTarget(event)||pointer?.id!==event.pointerId)return;event.stopPropagation();const gesture=pointer;pointer=null;const p=point(event);if(!p||gesture.dragged||!preparationGestureIsTap(event.clientX-gesture.x,event.clientY-gesture.y))return;
    if(application.view.preparation.selectedType)place(p.x,p.y);else{const hit=devices().map(d=>({d,distance:Math.hypot((d.x-p.x)*camera!.zoom,(d.y-p.y)*camera!.zoom*camera!.projectionY)})).filter(({d,distance})=>distance<=Math.max(22,application.view.config.devices.definitions[d.kind].radius*camera!.zoom*1.5)).sort((a,b)=>a.distance-b.distance)[0];state.selectedDeviceId=hit?.d.id??null;render();}
  }
  function escape():boolean{
    if(!screen())return false;
    if(state.replayIntroChapter!==undefined){delete state.replayIntroChapter;showChronicle('[data-prep-action="replay-intro"]', bookScroll);return true;}
    if(application.view.screen==='preparation'&&application.view.campaign?.intro)return true;
    if(state.chronicle?.contents){
      delete state.chronicle.previewChapterId;
      showContents(false);
      return true;
    }
    if(state.panel||application.view.screen==='trials'){closePanel();return true;}
    if(application.view.preparation.selectedType){cancelPlacement();render();return true;}
    if(state.selectedDeviceId!==null){state.selectedDeviceId=null;render();return true;}
    return false;
  }
  function key(event:KeyboardEvent):void{
    if(!screen())return;
    if(event.key==='Escape'&&event.repeat){event.preventDefault();event.stopPropagation();return;}
    if(event.key==='Escape'&&escape()){event.preventDefault();event.stopPropagation();return;}
    const drawer=screen()?.querySelector<HTMLElement>('[role="dialog"]');
    if(drawer&&!application.view.error&&event.key==='Tab'){const focusable=[...drawer.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}return;}
    if(!canvasTarget(event)||!application.view.preparation.selectedType||application.view.error)return;
    const offsets:Record<string,readonly[number,number]>={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]};const offset=offsets[event.key];
    if(offset){event.preventDefault();event.stopPropagation();preview(keyPoint.x+offset[0],keyPoint.y+offset[1]);}else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();place(keyPoint.x,keyPoint.y);}
  }
  const cancel=()=>{pointer=null;bookSwipe=null;};
  root.addEventListener('click',click,true);root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel,true);root.addEventListener('keydown',key,true);window.addEventListener('resize',schedule);
  return{sync,capture,escape,destroy(){destroyed=true;observer?.disconnect();cancelAnimationFrame(frame);root.removeEventListener('click',click,true);root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('keydown',key,true);window.removeEventListener('resize',schedule);}};
}
