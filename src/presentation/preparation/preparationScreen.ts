import type {ApplicationView, DeviceKind, EnemyKind} from '../../contracts';
import {checkPlacement} from '../../application/placement';
import type {PreparationUiState} from './preparationState';
import {nightChronicle} from './nightChronicle';
import {openChronicle, type ChronicleSelection} from './chronicleState';
import {defenseDeviceDescription, repairLampDescription} from '../shared/devices';
import {prepLabel,preparationEscape as esc,watchPrepAsset,watchPrepIcon as icon} from './preparationArtwork';
import {resolveLanguage} from '../shared/localization';
import {campaignChapterIntro} from '../../content/campaignIntros';
import {campaignStoryCard} from './campaignStoryCard';
import {campaignCurrencyPanel} from '../campaignCollection';
import {campaignDeviceTitle} from '../shared/devices';
import {DEVICE_VARIANTS, effectiveWeaponDefinition} from '../../content/campaignVariants';

export interface PreparationDetails { lenses:string; lateModes:string; waves:string }
export const preparationKinds:readonly DeviceKind[]=['cannon','barrier','light-trap','harpoon','mortar','bell','generator','repair-lamp'];
const deviceArt: Record<DeviceKind,string> = {cannon:'shore-cannon', barrier:'palisade', 'light-trap':'light-trap', harpoon:'harpoon', mortar:'mortar', bell:'bell', generator:'generator', 'repair-lamp':'repair-lamp'};
const button=(action:string,text:string,options:{icon?:string;disabled?:boolean;className?:string;attrs?:string;shortLabel?:string;iconOnly?:boolean}={})=>`<button type="button" class="prep-button watch-button ${options.className??''}" data-prep-action="${action}" ${options.disabled?'disabled':''} ${options.attrs??''} ${options.shortLabel||options.iconOnly?`aria-label="${esc(text)}"`:''}>${options.icon?icon(options.icon):''}${options.iconOnly?'':options.shortLabel?`<span class="prep-long-label">${prepLabel(text)}</span><span class="prep-short-label">${prepLabel(options.shortLabel)}</span>`:prepLabel(text)}</button>`;
const number=(v:number)=>String(Number(v.toFixed(1)));
export function preparationInvalidPlacements(view:ApplicationView):readonly {id:number;reason:string}[]{
  return view.preparation.placements.flatMap(p=>{const check=checkPlacement(view.config,view.preparation.placements.filter(o=>o.id!==p.id),p.kind,p.x,p.y);return check.valid?[]:[{id:p.id,reason:check.reason}];});
}
function catalogue(view:ApplicationView, active: DeviceKind, english: boolean):string{
  const prep=view.preparation,rules=view.config.devices,blocked=!!view.error;
  const variants=(view.campaign?.rewards.collection ?? []).flatMap(item => {
    const id=item.id;
    if(!item.unlocked || (id!=='siege-cannon' && id!=='long-harpoon') || DEVICE_VARIANTS[id].kind!==active) return [];
    const {kind}=DEVICE_VARIANTS[id], base=rules.definitions[kind], variant=effectiveWeaponDefinition(view.config,{kind,variantId:id});
    const unlocked=!!view.config.availableDevices?.includes(kind);
    return [`<article class="prep-variant"><h3>${esc(item.title.ru)}</h3><p>${number(base.damage)} → ${number(variant.damage)} урона · ${number(base.range)} → ${number(variant.range)} дальность · ${number(base.attackInterval)} → ${number(variant.attackInterval)} с</p>
      ${!unlocked?'<p>Сначала откройте базовый тип.</p>':''}
      ${button('purchase-device',`Купить экземпляр · ${base.cost} ◈`,{disabled:blocked||!unlocked||view.profile.resources<base.cost,attrs:`data-kind="${kind}" data-variant="${id}"`})}</article>`];
  });
  const unlocked = (kind: DeviceKind) => !view.config.availableDevices || view.config.availableDevices.includes(kind);
  const d=rules.definitions[active],open=unlocked(active), owned=prep.inventory.filter(e=>e.kind===active);
  const ready=owned.filter(e=>!e.variantId&&!e.position&&e.health>0&&!e.consumed).length;
  const placed=prep.placements.filter(e=>e.kind===active).length;
  const performance=[`${d.health} HP`, d.damage ? (english?`Damage ${d.damage}`:`Урон ${d.damage}`) : '', d.range ? (english?`Range ${d.range}`:`Дальность ${d.range}`) : '', d.attackInterval ? `${number(d.attackInterval)} ${english?'s':'с'}` : ''].filter(Boolean).join(' · ');
  const tip = active==='repair-lamp' ? repairLampDescription(view)
    : ['cannon','harpoon','barrier','generator','light-trap'].includes(active)
      ? defenseDeviceDescription(view, active as 'cannon'|'harpoon'|'barrier'|'generator'|'light-trap') : '';
  return `<div class="prep-catalogue"><h3>${english?'Device types':'Каталог типов'}</h3>
    <div class="prep-mechanisms" role="group" aria-label="${english?'Device types':'Каталог типов'}">${preparationKinds.map(kind=>`<button type="button" class="prep-button watch-inset prep-mechanism" data-prep-action="browse-device" data-kind="${kind}" aria-label="${esc(rules.definitions[kind].name)}" aria-pressed="${kind===active}" data-locked="${!unlocked(kind)}"><img src="${watchPrepAsset('world',deviceArt[kind])}" alt="" draggable="false">${unlocked(kind)?'':icon('lock')}</button>`).join('')}</div>
    <article class="prep-type-detail">
    <div class="prep-card-line"><h3>${esc(d.name)}</h3><small>${english?'Placed':'На поле'} ${placed}/${rules.perType[active]}</small></div>
    <p>${performance}</p>
    ${open?'':`<p>${english?'Unlock this device in Upgrades.':'Откройте тип в улучшениях.'}</p>`}
    <div class="prep-card-buttons">${button('purchase-device',`Купить экземпляр · ${d.cost}`,{icon:'coin',disabled:blocked||!open||view.profile.resources<d.cost,attrs:`data-kind="${active}"`})}
    ${button('device-type','Выбрать',{disabled:blocked||!open||!ready,attrs:`data-kind="${active}" aria-pressed="${prep.selectedType===active}" ${ready?'':'hidden'}`})}</div>
    </article>${variants.join('')}
    ${owned.length?'<h3 class="prep-inventory-heading">Мои устройства</h3>':`<p class="prep-empty-stock">${english?'No owned devices of this type. Unlocking a type grants its first device.':'Нет устройств этого типа. При открытии типа вы получите первый экземпляр.'}</p>`}
    <ul class="prep-inventory">${owned.map(e=>`<li class="watch-inset"><div class="prep-card-line"><h4>${esc(campaignDeviceTitle(view.config,e))} #${e.id}</h4><small>${e.position?'На поле':'В запасе'} · ${number(e.health)}/${e.maxHealth} HP${e.kind==='light-trap'?` · Заряды ${e.trapCharges??(e.consumed?0:1)}/${rules.trap.charges}`:''}</small></div><div class="prep-card-buttons">${button(e.position?'move-device':'owned-device',e.position?'Переставить':'Расставить',{disabled:blocked||e.health<=0||e.consumed,attrs:`data-device-id="${e.id}"`})}${e.position?button('remove-device','В запас',{disabled:blocked,attrs:`data-device-id="${e.id}"`}):''}${button('repair-device',`Ремонт · ${e.repairCost}`,{disabled:blocked||e.health>=e.maxHealth||view.profile.resources<e.repairCost,attrs:`data-device-id="${e.id}"`})}${e.kind==='light-trap'?button('recharge-device',`Перезарядить · ${e.rechargeCost}`,{disabled:blocked||e.rechargeCost<=0||view.profile.resources<e.rechargeCost,attrs:`data-device-id="${e.id}"`}):''}</div></li>`).join('')}</ul>
    <p>${esc(d.description)}</p>${tip?`<p>${tip}</p>`:''}
    ${button('clear-devices','Все устройства в запас',{disabled:blocked||!prep.placements.length})}</div>`;
}
function ability(view:ApplicationView):{name:string;html:string}{
  const a=view.config.ability;
  const english=resolveLanguage(view.settings.language,undefined,typeof navigator==='undefined'?[]:navigator.languages)==='en';
  if(a){
    const names={overload:'Перегрузка',seal:'Печать',barrage:'Залп',bastion:'Бастион'};
    const englishNames={overload:'Overload',seal:'Seal',barrage:'Barrage',bastion:'Bastion'};
    const labels:Record<string,string>={cooldownSeconds:'Перезарядка',initiallyReady:'Готова в начале ночи',durationSeconds:'Длительность',damageBonus:'Бонус урона',turnSpeedBonus:'Бонус скорости поворота',armorDamageBonus:'Бонус урона броне',guidanceDamageBonus:'Бонус при наведении',damageBonusCap:'Предел бонуса урона',turnSpeedBonusCap:'Предел бонуса поворота',targetingRange:'Дальность выбора',radius:'Радиус',speedMultiplier:'Множитель скорости',minimumSpeedMultiplier:'Минимальный множитель скорости',lingeringSeconds:'Остаточное действие',entrySeconds:'Действие при входе',entrySpeedMultiplier:'Множитель скорости при входе',airDamageBonus:'Бонус по летающим',blastRadiusBonus:'Бонус радиуса взрыва',projectileSpeedBonus:'Бонус скорости снаряда',litDamageBonus:'Бонус по освещённой цели',additionalAttacksPerWeapon:'Дополнительные атаки орудия',damageReduction:'Снижение урона',mechanismReduction:'Защита механизмов',heavyReduction:'Защита от тяжёлых ударов',fadeSeconds:'Постепенное угасание',fadeReduction:'Защита при угасании',abilityReductionCap:'Предел защиты способности',totalReductionCap:'Общий предел защиты'};
    const name=english?englishNames[a.abilityId]:names[a.abilityId];
    return{name,html:`<h3>${name}</h3><dl>${Object.entries(a).filter(([k])=>labels[k]).map(([k,v])=>`<div><dt>${english?k.replace(/Seconds$/,'').replace(/([A-Z])/g,' $1').replace(/^./,letter=>letter.toUpperCase()):labels[k]}</dt><dd>${typeof v==='boolean'?(english?(v?'Yes':'No'):(v?'Да':'Нет')):esc(String(v))}${k.endsWith('Seconds')?(english?' s':' с'):''}</dd></div>`).join('')}</dl><p>${english?'Use this ability during battle.':'Способность применяется во время боя.'}</p>`};
  }
  const f=view.config.flash;return{name:'Вспышка',html:`<h3>Вспышка</h3><p>${f.enabled===false?'Закрыта — открой её в развитии маяка.':`Доступна в бою · радиус ${f.radius} · урон ${f.damage} · оглушение ${f.stunDuration} с · перезарядка ${f.cooldown} с`}</p>`};
}
function recon(view:ApplicationView,details:PreparationDetails):string{
  const c=view.config;
  const night=view.nights.find(entry=>entry.id===view.selectedNightId);
  const known=new Map<EnemyKind, number>();
  let unknown=0;
  for(const kind of c.waves[0]?.enemies??[]){
    if(view.profile.encountered.includes(kind))known.set(kind,(known.get(kind)??0)+1);
    else unknown++;
  }
  const art: Partial<Record<EnemyKind,string>>={ghost:'ghost',bat:'bat',turtle:'armored-turtle'};
  const firstWave=[...known].map(([kind,count])=>{
    const sprite=art[kind];
    return `<li>${sprite?`<img src="${watchPrepAsset('world',sprite)}" alt="" draggable="false">`:icon('target')}<span>${esc(c.enemies[kind].name)} ×${count}</span></li>`;
  });
  if(unknown)firstWave.push(`<li><span class="prep-unknown" aria-hidden="true">?</span><span>Неизвестное существо ×${unknown}</span></li>`);
  return `<h3>${esc(night?.name??c.id)}</h3><p>${esc(night?.description??'')}</p>
  <h3 class="prep-recon-heading">Характеристики маяка</h3>
  <dl class="prep-recon-stats watch-inset"><div><dt>Прочность</dt><dd>${c.lighthouseHealth}</dd></div><div><dt>Целей луча</dt><dd>${c.beam.maxTargets}</dd></div><div><dt>Волны</dt><dd>${c.waves.length}</dd></div></dl>
  ${firstWave.length?`<h3>Первая волна</h3><ul class="prep-first-wave">${firstWave.join('')}</ul>`:''}
  <h3>Волны</h3><ol class="prep-wave-list">${details.waves}</ol>${details.lateModes}
  <p>Луч: ${number(c.beam.damagePerSecond)} урона/с · дальность ${c.beam.range} · угол ${number(c.beam.halfAngle*360/Math.PI)}°</p>
  <p>Награда за победу: ${c.victoryReward} ◈</p>${c.boss?`<h3>${esc(c.boss.name)}</h3><p>Уровень ${c.boss.level} · ${c.boss.health} HP · Материал за победу ${night?.materialReward??c.boss.materialReward}</p>`:''}${c.ship?`<h3>Корабль</h3><p>Спасение ${c.ship.rescueSeconds} с · срок ${c.ship.deadline} с · награда ${c.ship.reward} ◈</p>`:''}
  <p>Золотой пунктир — дальность света маяка. Голубой пунктир — область выхода существ из тумана.</p>`;
}
export function chronicleScreen(view: ApplicationView, selection: ChronicleSelection): string {
  const trials = view.screen === 'trials' ? ' trials-panel' : '';
  return `<section class="preparation-screen preparation-chronicle${trials}" data-text-size="${view.settings.textSize}">${nightChronicle(view, selection)}</section>`;
}

export function preparationScreen(view:ApplicationView,state:PreparationUiState,details:PreparationDetails):string{
  const language=resolveLanguage(view.settings.language,undefined,typeof navigator==='undefined'?[]:navigator.languages);
  const replay=state.panel==='night' && state.replayIntroChapter !== undefined ? campaignChapterIntro(state.replayIntroChapter-1) : undefined;
  const intro=view.campaign?.intro ?? (replay && view.campaign?.seenIntroIds.includes(replay.id) ? replay : undefined);
  if(intro) return `<section class="preparation-screen campaign-story-shell" data-text-size="${view.settings.textSize}">${campaignStoryCard(intro,language,!view.campaign?.intro,!!view.error)}</section>`;
  if(state.panel==='night'){
    const selection=state.chronicle??openChronicle(view);
    if(selection)return chronicleScreen(view, selection);
  }
  const prep=view.preparation,blocked=!!view.error,night=view.nights.find(n=>n.id===view.selectedNightId),chapters=[...new Set(view.nights.filter(n=>!n.optional).map(n=>n.chapter))],chapter=night?chapters.indexOf(night.chapter)+1:1,nightNumber=view.nights.filter(n=>n.chapter===night?.chapter&&!n.optional).findIndex(n=>n.id===night?.id)+1;
  const selected=prep.placements.find(p=>p.id===state.selectedDeviceId),invalid=preparationInvalidPlacements(view),a=ability(view),lens=view.lenses.find(l=>l.definition.id===view.selectedLensId),panel=state.panel==='night'?null:state.panel;
  const selectedIssue=invalid.find(entry=>entry.id===selected?.id);
  const startBlocked=blocked || !prep.canStart || !!prep.selectedType || invalid.length>0;
  const panelTitle={devices:'Устройства',lens:'Линза',ability:'Способность',recon:'Разведка',shards:'Осколки',pearls:'Жемчужины'};
  const english=language==='en';
  let body='';
  if(panel==='devices')body=catalogue(view,state.catalogKind??selected?.kind??'cannon',english);
  else if(panel==='lens')body=`${lens?`<article class="prep-current-lens watch-inset"><h3>${icon('light')}${esc(lens.definition.name)}</h3><p>${esc(lens.definition.description)}</p><small>${english?'Equipped':'Оснащена'}</small></article>`:''}${details.lenses}`;
  else if(panel==='ability')body=a.html;
  else if(panel==='recon')body=recon(view,details);
  const equipped=view.campaign?.abilities.find(entry=>entry.id===view.campaign?.selectedAbilityId);
  if(panel==='ability'&&view.campaign){
    body=`<div class="prep-ability-options">${button('select-ability',english?'No ability':'Без способности',{disabled:blocked,attrs:`data-ability="none" aria-pressed="${view.campaign.selectedAbilityId===null}"`})}${view.campaign.abilities.map(entry=>button('select-ability',english?entry.en:entry.ru,{icon:!entry.available?'lock':entry.id===view.campaign?.selectedAbilityId?'check':undefined,disabled:!entry.available||blocked,attrs:`data-ability="${entry.id}" aria-pressed="${entry.id===view.campaign?.selectedAbilityId}"`})).join('')}</div>${view.campaign.selectedAbilityId?`<div class="prep-ability-description watch-inset">${a.html}</div>`:''}`;
  }
  else if(panel==='shards'||panel==='pearls'){
    const shards=panel==='shards';
    body=view.campaign ? campaignCurrencyPanel(view,shards?'shards':'pearl') : `<div class="prep-currency-balance">${icon(shards?'coin':'pearl')}<strong>${shards?view.profile.resources:view.profile.bossMaterials}</strong></div>
      <p>${shards?(english?'Shard balance':'Баланс осколков'):(english?'Pearl balance':'Баланс жемчужин')}</p>
      <section class="prep-currency-offers watch-inset"><h3>${english?'Video offers':'Видеопредложения'}</h3><p>Получение валюты за просмотр видео пока недоступно.</p></section>`;
  }
  const offerPanel = view.campaign && (panel === 'shards' || panel === 'pearls');
  const drawerHeader = offerPanel
    ? `${button('close-panel',english?'Back':'Назад',{icon:'back',iconOnly:true})}<h2 class="watch-title" id="prep-drawer-title">${panelTitle[panel!]}</h2><span class="prep-offer-balance">${icon(panel === 'shards' ? 'coin' : 'pearl')}${panel === 'shards' ? view.profile.resources : view.profile.bossMaterials}</span>`
    : panel ? `<h2 id="prep-drawer-title">${panelTitle[panel]}</h2>${button('close-panel','Закрыть')}` : '';
  const dataPanel=(p:string)=>`data-panel="${p}" aria-expanded="${panel===p}"`;
  const usedTypes=new Set(prep.placements.map(placement=>placement.kind)).size;
  const counts=`<span id="prep-counts" class="prep-counts">
    <span class="prep-count">${prepLabel('Объекты',true)} ${prepLabel(`${prep.placements.length}/${view.config.devices.maxObjects}`)}</span>
    <span class="prep-count">${prepLabel('Типы',true)} ${prepLabel(`${usedTypes}/${view.config.devices.typeSlots}`)}</span>
  </span>`;
  return `<section class="preparation-screen" aria-label="Подготовка к ночи" data-text-size="${view.settings.textSize}">
    <canvas class="prep-world" data-prep-world tabindex="0" role="group" aria-label="Поле расстановки. Стрелки — прицел, Enter — установить, Escape — отменить выбор" ${panel?'inert':''}></canvas>
    <header class="prep-header prep-band" ${panel?'inert':''}>
      ${button('back','Назад',{icon:'back',iconOnly:true,className:'prep-back',disabled:blocked})}
      <button type="button" class="prep-night prep-button watch-button" data-prep-action="panel" ${dataPanel('night')} aria-haspopup="dialog"><span class="prep-night-full">${prepLabel(night?.optional?night.chapter:`Глава ${chapter} · ${night?.chapter??''}`,true)}${prepLabel(`${night?.optional?'Испытание':`Ночь ${Math.max(1,nightNumber)}`} · ${night?.name??view.config.id}`)}</span><span class="prep-night-compact">${prepLabel(night?.optional?'Испытание':`Глава ${chapter} · Ночь ${Math.max(1,nightNumber)}`,true)}${prepLabel(night?.name??view.config.id)}</span></button>
      ${button('panel',`${view.profile.resources} +`,{icon:'coin',className:'prep-currency prep-shards',attrs:`${dataPanel('shards')} aria-label="Осколки: пополнение · ${view.profile.resources}"`})}
      ${button('panel',`${view.profile.bossMaterials} +`,{icon:'pearl',className:'prep-currency prep-pearls',attrs:`${dataPanel('pearls')} aria-label="Жемчужины: пополнение · ${view.profile.bossMaterials}"`})}
      <div class="prep-secondary-nav">
        <div class="prep-utilities">${button('development','Улучшения',{icon:'tree',shortLabel:'Улучш.',disabled:blocked})}${button('panel','Разведка',{icon:'book',attrs:dataPanel('recon')})}</div>
        <div class="prep-tools">${view.campaign?button('campaign-collection','Коллекция',{className:'prep-collection',disabled:blocked}):''}
          ${button('zoom',state.cameraMode==='close'?'Общий план':'Крупный план',{shortLabel:state.cameraMode==='close'?'−':'+',className:'prep-zoom',attrs:`aria-pressed="${state.cameraMode==='close'}"`})}</div>
      </div>
    </header>
    <div class="prep-field" data-prep-field ${panel?'inert':''}>
      ${prep.selectedType?`<aside class="prep-placement watch-panel"><strong>${selected?`${english?'Move':'Перенос'} · ${esc(campaignDeviceTitle(view.config,selected))} #${selected.id}`:(english?'Place a device':'Установка устройства')}</strong><p class="prep-feedback" data-prep-feedback role="status">${esc(prep.preview?.reason??'Выбери место на поле. Стрелки — прицел, Enter — установить.')}</p>${button('cancel-placement',english?'Cancel':'Отмена',{className:'prep-cancel',attrs:`aria-label="${english?'Cancel placement':'Отменить расстановку'}"`})}</aside>`:''}
      ${selected&&!prep.selectedType?`<aside class="prep-inspector watch-panel" data-invalid="${!!selectedIssue}" aria-label="Выбранное устройство"><div class="prep-card-line"><strong>${esc(campaignDeviceTitle(view.config,selected))} #${selected.id}</strong><small>${number(prep.inventory.find(d=>d.id===selected.id)?.health??0)}/${view.config.devices.definitions[selected.kind].health} HP</small></div><p class="${selectedIssue?'prep-danger':''}">${esc(selectedIssue?.reason??'Можно оставить на поле.')}</p><div class="prep-card-buttons">${button('move-device','Переставить',{disabled:blocked,className:selectedIssue?'watch-primary':'',attrs:`data-device-id="${selected.id}"`})}${button('remove-device','В запас',{disabled:blocked,attrs:`data-device-id="${selected.id}"`})}${selectedIssue?`<details class="prep-more"><summary class="prep-button watch-button" aria-label="${english?'More actions':'Другие действия'}">…</summary><div class="watch-panel">`:''}${button('panel','Ремонт и заряды',{attrs:dataPanel('devices')})}${button('deselect','Закрыть')}${selectedIssue?'</div></details>':''}</div></aside>`:''}
    </div>
    <footer class="prep-dock prep-band watch-panel" ${panel?'inert':''}>
      <button type="button" class="prep-button prep-devices watch-button" data-prep-action="panel" ${dataPanel('devices')} aria-label="Устройства" aria-describedby="prep-counts">
        <span class="prep-device-title">${icon('cannon')}${prepLabel('Устройства')}</span>
      </button>
      ${counts}
      ${button('panel',lens?.definition.name??'Базовая',{icon:'light',className:'prep-lens',attrs:`${dataPanel('lens')} aria-label="Линза"`})}
      ${button('panel',view.campaign&&!equipped?(english?'None':'Пусто'):a.name,{icon:'charge',className:'prep-ability',attrs:`${dataPanel('ability')} aria-label="${english?'Ability':'Способность'}${view.campaign?': '+esc(equipped?(english?equipped.en:equipped.ru):(english?'none':'не выбрана')):''}"`})}
      ${button('start','Начать ночь',{icon:startBlocked?'lock':'play',className:'prep-start watch-primary',disabled:startBlocked})}
      ${(!prep.canStart||invalid.length)&&!(invalid.length===1&&selectedIssue&&!prep.selectedType)?`<p class="prep-reason" role="status">${esc(invalid.length?'Есть устройства за границей суши. Переставьте их или верните в запас.':prep.reason)}</p>`:''}
    </footer>
    ${panel?`<div class="prep-drawer-backdrop" data-prep-action="close-panel"></div><aside class="prep-drawer ${offerPanel?'prep-offer':'watch-panel'}" data-drawer="${panel}" role="dialog" aria-modal="true" aria-labelledby="prep-drawer-title"><header>${drawerHeader}</header><div class="prep-drawer-body" data-prep-scroll>${body}</div></aside>`:''}
  </section>`;
}
