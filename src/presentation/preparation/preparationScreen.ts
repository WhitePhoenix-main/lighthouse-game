import type {ApplicationView, DeviceKind} from '../../contracts';
import {checkPlacement} from '../../application/placement';
import type {PreparationUiState} from './preparationState';
import {defenseDeviceDescription, repairLampDescription} from '../shared/devices';

export interface PreparationDetails { nights:string; lenses:string; lateModes:string; waves:string }
export const preparationKinds:readonly DeviceKind[]=['cannon','harpoon','mortar','bell','repair-lamp','barrier','generator','light-trap'];
export const preparationEscape=(v:string):string=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const esc=preparationEscape;
const asset=(name:string)=>`${import.meta.env.BASE_URL}images/preparation/ui/${name}.png`;
const icon=(name:string)=>`<img class="prep-icon" src="${asset(name)}" alt="" draggable="false">`;
export const prepLabel=(text:string,secondary=false)=>`<span class="prep-label${secondary?' prep-secondary':''}" data-prep-label><span>${esc(text)}</span><canvas aria-hidden="true"></canvas></span>`;
const button=(action:string,text:string,options:{icon?:string;disabled?:boolean;className?:string;attrs?:string;shortLabel?:string}={})=>`<button type="button" class="prep-button ${options.className??''}" data-prep-action="${action}" ${options.disabled?'disabled':''} ${options.attrs??''} ${options.shortLabel?`aria-label="${esc(text)}"`:''}>${options.icon?icon(options.icon):''}${options.shortLabel?`<span class="prep-long-label">${prepLabel(text)}</span><span class="prep-short-label">${prepLabel(options.shortLabel)}</span>`:prepLabel(text)}</button>`;
const number=(v:number)=>String(Number(v.toFixed(1)));
export function preparationInvalidPlacements(view:ApplicationView):readonly {id:number;reason:string}[]{
  return view.preparation.placements.flatMap(p=>{const check=checkPlacement(view.config,view.preparation.placements.filter(o=>o.id!==p.id),p.kind,p.x,p.y);return check.valid?[]:[{id:p.id,reason:check.reason}];});
}
function catalogue(view:ApplicationView):string{
  const prep=view.preparation,rules=view.config.devices,blocked=!!view.error;
  return `<p>Выбери тип или собственный экземпляр, затем нажми на поле. Стрелки перемещают прицел, Enter устанавливает устройство.</p><div class="prep-catalogue">${preparationKinds.map(kind=>{
    const d=rules.definitions[kind],open=!view.config.availableDevices||view.config.availableDevices.includes(kind),ready=prep.inventory.filter(e=>e.kind===kind&&!e.position&&e.health>0&&!e.consumed).length;
    return `<article><h3>${esc(d.name)}</h3><p>${esc(d.description)}</p><p>${d.health} HP · ${d.range} дальность · ${d.damage} урона · ${number(d.attackInterval)} с</p><p>В запасе готово: ${ready} · На поле: ${prep.placements.filter(e=>e.kind===kind).length}/${rules.perType[kind]}</p>${open?'':'<p>Закрыто · открой тип в развитии маяка</p>'}${button('device-type','Выбрать',{disabled:blocked||!open||!ready,attrs:`data-kind="${kind}" aria-pressed="${prep.selectedType===kind}"`})}${button('purchase-device',`Купить экземпляр · ${d.cost} ◈`,{disabled:blocked||!open||view.profile.resources<d.cost,attrs:`data-kind="${kind}"`})}${['cannon','harpoon','barrier','generator','light-trap'].includes(kind)?`<p>${defenseDeviceDescription(view,kind as 'cannon'|'harpoon'|'barrier'|'generator'|'light-trap')}</p>`:''}</article>`;
  }).join('')}</div><h3>Мои устройства</h3>${prep.inventory.length?'':'<p>Пока нет устройств. Открытие типа выдаёт первый экземпляр.</p>'}<ul class="prep-inventory">${prep.inventory.map(e=>`<li><h4>${esc(rules.definitions[e.kind].name)} #${e.id}</h4><p>${e.position?'На поле':'В запасе'} · ${number(e.health)}/${e.maxHealth} HP${e.kind==='light-trap'?` · Заряды ${e.trapCharges??(e.consumed?0:1)}/${rules.trap.charges}`:''}</p>${button(e.position?'move-device':'owned-device',e.position?'Переставить':'Расставить',{disabled:blocked||e.health<=0||e.consumed,attrs:`data-device-id="${e.id}"`})}${e.position?button('remove-device','В запас',{disabled:blocked,attrs:`data-device-id="${e.id}"`}):''}${button('repair-device',`Ремонт · ${e.repairCost} ◈`,{disabled:blocked||e.health>=e.maxHealth||view.profile.resources<e.repairCost,attrs:`data-device-id="${e.id}"`})}${e.kind==='light-trap'?button('recharge-device',`Перезарядить · ${e.rechargeCost} ◈`,{disabled:blocked||e.rechargeCost<=0||view.profile.resources<e.rechargeCost,attrs:`data-device-id="${e.id}"`}):''}</li>`).join('')}</ul><p>${repairLampDescription(view)}</p>${button('clear-devices','Все устройства в запас',{disabled:blocked||!prep.placements.length})}`;
}
function ability(view:ApplicationView):{name:string;html:string}{
  const a=view.config.ability;
  if(a){
    const names={overload:'Перегрузка',seal:'Печать',barrage:'Залп',bastion:'Бастион'};
    const labels:Record<string,string>={cooldownSeconds:'Перезарядка',initiallyReady:'Готова в начале ночи',durationSeconds:'Длительность',damageBonus:'Бонус урона',turnSpeedBonus:'Бонус скорости поворота',armorDamageBonus:'Бонус урона броне',guidanceDamageBonus:'Бонус при наведении',damageBonusCap:'Предел бонуса урона',turnSpeedBonusCap:'Предел бонуса поворота',targetingRange:'Дальность выбора',radius:'Радиус',speedMultiplier:'Множитель скорости',minimumSpeedMultiplier:'Минимальный множитель скорости',lingeringSeconds:'Остаточное действие',entrySeconds:'Действие при входе',entrySpeedMultiplier:'Множитель скорости при входе',airDamageBonus:'Бонус по летающим',blastRadiusBonus:'Бонус радиуса взрыва',projectileSpeedBonus:'Бонус скорости снаряда',litDamageBonus:'Бонус по освещённой цели',additionalAttacksPerWeapon:'Дополнительные атаки орудия',damageReduction:'Снижение урона',mechanismReduction:'Защита механизмов',heavyReduction:'Защита от тяжёлых ударов',fadeSeconds:'Постепенное угасание',fadeReduction:'Защита при угасании',abilityReductionCap:'Предел защиты способности',totalReductionCap:'Общий предел защиты'};
    return{name:names[a.abilityId],html:`<h3>${names[a.abilityId]}</h3><dl>${Object.entries(a).filter(([k])=>labels[k]).map(([k,v])=>`<div><dt>${labels[k]}</dt><dd>${typeof v==='boolean'?(v?'Да':'Нет'):esc(String(v))}${k.endsWith('Seconds')?' с':''}</dd></div>`).join('')}</dl><p>Способность применяется во время боя.</p>`};
  }
  const f=view.config.flash;return{name:'Вспышка',html:`<h3>Вспышка</h3><p>${f.enabled===false?'Закрыта — открой её в развитии маяка.':`Доступна в бою · радиус ${f.radius} · урон ${f.damage} · оглушение ${f.stunDuration} с · перезарядка ${f.cooldown} с`}</p>`};
}
function recon(view:ApplicationView,details:PreparationDetails):string{
  const c=view.config;
  return `<p>Золотой пунктир — дальность света маяка. Голубой пунктир — область выхода существ из тумана.</p><h3>Характеристики маяка</h3><p>Прочность ${c.lighthouseHealth} · Луч: ${number(c.beam.damagePerSecond)} урона/с · дальность ${c.beam.range} · угол ${number(c.beam.halfAngle*360/Math.PI)}° · целей ${c.beam.maxTargets}</p><p>Награда за победу: ${c.victoryReward} ◈</p>${c.boss?`<h3>${esc(c.boss.name)}</h3><p>Уровень ${c.boss.level} · ${c.boss.health} HP · Материал за победу ${c.boss.materialReward}</p>`:''}${c.ship?`<h3>Корабль</h3><p>Спасение ${c.ship.rescueSeconds} с · срок ${c.ship.deadline} с · награда ${c.ship.reward} ◈</p>`:''}<h3>Волны</h3><ol>${details.waves}</ol>${details.lateModes}`;
}
export function preparationScreen(view:ApplicationView,state:PreparationUiState,details:PreparationDetails):string{
  const prep=view.preparation,blocked=!!view.error,night=view.nights.find(n=>n.id===view.selectedNightId),chapters=[...new Set(view.nights.filter(n=>!n.optional).map(n=>n.chapter))],chapter=night?chapters.indexOf(night.chapter)+1:1,nightNumber=view.nights.filter(n=>n.chapter===night?.chapter&&!n.optional).findIndex(n=>n.id===night?.id)+1;
  const selected=prep.placements.find(p=>p.id===state.selectedDeviceId),invalid=preparationInvalidPlacements(view),a=ability(view),lens=view.lenses.find(l=>l.definition.id===view.selectedLensId),panel=state.panel;
  const panelTitle={devices:'Устройства',lens:'Линза',ability:'Способность',recon:'Разведка',night:'Выбор ночи',shards:'Осколки',pearls:'Жемчужины'};
  let body='';
  if(panel==='devices')body=catalogue(view);else if(panel==='lens')body=details.lenses;else if(panel==='ability')body=a.html;else if(panel==='recon')body=recon(view,details);else if(panel==='night')body=details.nights+details.lateModes;
  else if(panel==='shards'||panel==='pearls')body='<p>Получение валюты за просмотр видео пока недоступно.</p>';
  const dataPanel=(p:string)=>`data-panel="${p}" aria-expanded="${panel===p}"`;
  return `<section class="preparation-screen" aria-label="Подготовка к ночи" data-text-size="${view.settings.textSize}">
    <canvas class="prep-world" data-prep-world tabindex="0" role="group" aria-label="Поле расстановки. Стрелки — прицел, Enter — установить, Escape — отменить выбор"></canvas>
    <header class="prep-header prep-band">
      ${button('back','Назад',{className:'prep-back prep-stone',disabled:blocked})}
      <button class="prep-night prep-button" data-prep-action="panel" ${dataPanel('night')}><span class="prep-night-full">${prepLabel(`Глава ${chapter} · ${night?.chapter??''}`,true)}${prepLabel(`${night?.optional?'Испытание':`Ночь ${Math.max(1,nightNumber)}`} · ${night?.name??view.config.id}`)}</span><span class="prep-night-compact">${prepLabel(`Глава ${chapter} · ${night?.optional?'Испытание':`Ночь ${Math.max(1,nightNumber)}`}`,true)}${prepLabel(night?.name??view.config.id)}</span><span aria-hidden="true">⌄</span></button>
      <div class="prep-currency prep-shards prep-stone">${icon('shard')}${prepLabel(String(view.profile.resources))}${button('panel','+',{className:'prep-plus',attrs:`${dataPanel('shards')} aria-label="Осколки: пополнение"`})}</div>
      <div class="prep-currency prep-pearls prep-stone">${icon('pearl')}${prepLabel(String(view.profile.bossMaterials))}${button('panel','+',{className:'prep-plus',attrs:`${dataPanel('pearls')} aria-label="Жемчужины: пополнение"`})}</div>
      <div class="prep-utilities prep-stone">${button('development','Улучшения',{icon:'upgrades',disabled:blocked})}${button('panel','Разведка',{icon:'recon',attrs:dataPanel('recon')})}</div>
    </header>
    <div class="prep-field" data-prep-field>
      <div class="prep-tools"><div class="prep-legend"><strong>${prepLabel(`${view.config.waves.length} волны`)}</strong><div class="prep-legend-row prep-light"><i aria-hidden="true"></i>${prepLabel('Свет маяка')}</div><div class="prep-legend-row prep-fog"><i aria-hidden="true"></i>${prepLabel('Выход из тумана')}</div></div>${button('zoom',state.cameraMode==='close'?'Общий план':'Крупный план',{icon:'zoom',className:'prep-zoom prep-stone',shortLabel:state.cameraMode==='close'?'Обзор':'План',attrs:`aria-pressed="${state.cameraMode==='close'}"`})}</div>
      <p class="prep-feedback" data-prep-feedback role="status" ${!prep.selectedType?'hidden':''}>${esc(prep.preview?.reason??'Выбери место на поле. Стрелки — прицел, Enter — установить.')}</p>
      ${prep.selectedType?button('cancel-placement','Отменить расстановку',{className:'prep-cancel prep-stone'}):''}
      ${selected&&!prep.selectedType?`<aside class="prep-inspector prep-stone" aria-label="Выбранное устройство"><strong>${esc(view.config.devices.definitions[selected.kind].name)} #${selected.id}</strong><p>${esc(invalid.find(p=>p.id===selected.id)?.reason??'Можно оставить на поле.')}</p><p>Прочность ${number(prep.inventory.find(d=>d.id===selected.id)?.health??0)}/${view.config.devices.definitions[selected.kind].health}</p>${button('move-device','Переставить',{disabled:blocked,attrs:`data-device-id="${selected.id}"`})}${button('remove-device','В запас',{disabled:blocked,attrs:`data-device-id="${selected.id}"`})}${button('panel','Ремонт и заряды',{attrs:dataPanel('devices')})}${button('deselect','Закрыть')}</aside>`:''}
    </div>
    <footer class="prep-dock prep-band">
      <div class="prep-counts">${prepLabel(`Объекты ${prep.placements.length}/${view.config.devices.maxObjects}`)}${prepLabel(`Типы ${new Set(prep.placements.map(p=>p.kind)).size}/${view.config.devices.typeSlots}`)}</div>
      ${button('panel','Устройства',{icon:'devices',className:'prep-devices prep-stone',attrs:dataPanel('devices')})}
      <div class="prep-equipment prep-stone">${button('panel',lens?.definition.name??'Базовая',{icon:'lens',className:'prep-lens',attrs:`${dataPanel('lens')} aria-label="Линза"`})}${button('panel',a.name,{icon:'flash',className:'prep-ability',attrs:`${dataPanel('ability')} aria-label="Способность"`})}</div>
      ${button('start','Начать ночь',{className:'prep-start prep-stone',disabled:blocked||!prep.canStart||invalid.length>0})}
      <p class="prep-free"><span class="prep-free-full">${prepLabel('Расстановка и старт бесплатны',true)}</span><span class="prep-free-compact">${prepLabel('Расстановка бесплатна',true)}</span></p>
      ${(!prep.canStart||invalid.length)?`<p class="prep-reason" role="status">${esc(invalid.length?'Есть устройства за границей суши. Переставьте их или верните в запас.':prep.reason)}</p>`:''}
    </footer>
    ${panel?`<div class="prep-drawer-backdrop" data-prep-action="close-panel"></div><aside class="prep-drawer" role="dialog" aria-modal="true" aria-labelledby="prep-drawer-title" data-prep-scroll><header><h2 id="prep-drawer-title">${panelTitle[panel]}</h2>${button('close-panel','Закрыть')}</header>${body}</aside>`:''}
  </section>`;
}
