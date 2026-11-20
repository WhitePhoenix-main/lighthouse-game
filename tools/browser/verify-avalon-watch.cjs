// Run against the Vite development entry. Each case owns a newly created, disposable profile.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.LIGHTHOUSE_PLAYWRIGHT_PATH || 'playwright');
const url = new URL(process.env.LIGHTHOUSE_TEST_URL || 'http://127.0.0.1:5173');
assert(['localhost','127.0.0.1'].includes(url.hostname));
const artPass = process.env.WATCH_ART_PASS;
if (artPass) assert(['before','after'].includes(artPass));
const out = artPass ? path.resolve('test-results/watch-art-audit', artPass) : path.resolve('test-results/avalon-watch-runtime');
const action = name => '[data-action="'+name+'"]';
const prep = name => '[data-prep-action="'+name+'"]';
const formats = [['desktop',1280,720],['portrait',...(artPass ? [360,640] : [390,844])],['landscape',...(artPass ? [720,360] : [844,390])]];

async function scenario(browser, format, lang, size) {
  const extra = artPass === 'after';
  const [device,width,height] = format, touch = device !== 'desktop';
  const name = [device,lang,size].join('-'), dir = path.join(out,name);
  await fs.mkdir(dir,{recursive:true});
  const context = await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,locale:lang==='en'?'en-US':'ru-RU',reducedMotion:'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const errors=[], stages=[], untranslated={};
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  const scope = s => page.locator(s+':visible').first();
  const hit = async s => {const control=scope(s);if(touch)await control.tap();else await control.click();};
  async function shot(stage, selector) {
    await scope(selector).waitFor();
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const broken=await page.evaluate(async()=>{
      const images=Array.from(document.querySelectorAll('img[src]')).filter(i=>i.getClientRects().length);
      await Promise.all(images.map(i=>i.decode().catch(()=>{})));
      return images.filter(i=>!i.naturalWidth).map(i=>i.getAttribute('src'));
    });
    assert.deepEqual(broken,[],stage+' missing images');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),stage+' horizontal overflow');
    if(lang==='en') {
      const raw = await page.locator('body').innerText();
      const remaining = raw.split('\n').filter(line=>/[А-ЯЁа-яё]/.test(line));
      if(remaining.length) untranslated[stage]=remaining;
    }
    await page.screenshot({scale:artPass?'css':'device',path:path.join(dir,stage+'.png')});
    stages.push(stage);
  }
  async function bindGame() {
    await page.evaluate(async()=>{
      const {LighthouseApplication}=await import('/src/application/gameApplication.ts');
      const advance=LighthouseApplication.prototype.advance;
      LighthouseApplication.prototype.advance=function(milliseconds){window.watchQA=this;return advance.call(this,milliseconds);};
    });
  }
  async function settle(victory) {
    return await page.evaluate(async victory=>{
      const {campaignStoryDriver}=await import('/tests/helpers/campaignStoryDriver.ts');
      const app=window.watchQA,drive=campaignStoryDriver(app.view.config,false);
      for(let i=0;i<24000 && app.view.screen==='battle';i++){
        if(victory)for(const command of drive(app.view.battle))app.command(command);
        app.advance(app.view.config.stepSeconds*1000);
      }
      return app.view.result?.outcome;
    },victory);
  }
  try {
    await page.goto(url.href);
    // Capture the mounted real application through the normal fixed-step call in this test document.
    await bindGame();
    await shot('01-menu','.menu-title-ready');
    await hit(action('settings')); await hit('[data-language="'+lang+'"]'); await hit('[data-size="'+size+'"]');
    assert.equal(await page.locator('html').getAttribute('lang'),lang);
    await shot('02-settings','.settings-back');
    if(extra) {
      await page.evaluate(()=>{const write=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){
        if(key==='lighthouse.settings.v1')throw new DOMException('QuotaExceededError','QuotaExceededError');
        return write.call(this,key,value);
      };window.restoreSettingsWriter=()=>{Storage.prototype.setItem=write;};});
      await hit('[data-enabled="false"]');
      await shot('settings-error','.reference-settings-error');
      await page.evaluate(()=>window.restoreSettingsWriter());
      await hit(action('cancel-settings'));
    }
    await hit('.settings-back'); await hit(action('game-menu'));
    await shot('03-game-menu','.game-menu-new-game'); assert(await scope(action('continue-game')).isDisabled());
    await hit(action('new-game')); await shot('04-intro','#campaign-intro-title');
    await hit(prep('acknowledge-intro'));
    await shot('05-preparation',prep('start'));
    await hit('.prep-night'); await shot('06-chronicle','.chronicle-screen, .night-chronicle');
    if(extra) {
      await hit(prep('chronicle-contents')); await shot('chronicle-chapters','.chronicle-index');
      await hit(prep('chronicle-nights-tab')); await hit(prep('replay-intro')); await shot('intro-replay','#campaign-intro-title');
      await hit(prep('close-intro-replay'));
    }
    await hit(prep('close-panel'));
    if(extra) for(const [panel,stage] of [['recon','prep-recon'],['lens','prep-lens'],['ability','prep-ability'],['shards','reward-offer']]) {
      await hit('[data-panel="'+panel+'"]');await shot(stage,'.prep-drawer');await hit('.prep-drawer '+prep('close-panel'));
    }
    await hit('.prep-devices'); await shot('07-devices','.prep-drawer');
    await hit('.prep-drawer '+prep('close-panel'));
    await hit(prep('development')); await shot('08-development','.campaign-development');
    const nodes=page.locator('.campaign-circuit-viewport '+action('campaign-select-node'));
    if(extra) {
      await hit('.campaign-circuit-viewport [data-state="locked"]');
      await shot('upgrades-locked','.campaign-development');
    }
    if(await nodes.count()>1) await (touch?nodes.nth(1).tap():nodes.nth(1).click());
    await hit('.campaign-development '+action('back'));
    await hit(prep('campaign-collection')); await shot('09-collection','.campaign-collection');
    await hit('[data-reward-id="moonbeam"][data-action="campaign-select-reward"]');
    await hit('.campaign-collection '+action('back'));
    await hit(prep('start'));
    await page.waitForFunction(()=>window.watchQA?.view.screen==='battle' && document.querySelector('.chapter-world-underlay')?.dataset.headlandReady==='true');
    const attempt=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lighthouse.campaign.v1')).activeAttempt?.id);
    const id=await attempt();assert(id,'active attempt');
    const gl=await page.locator('.ocean canvas:not(.chapter-world-underlay)').first().evaluate(canvas=>Boolean(canvas.getContext('webgl2')||canvas.getContext('webgl')));
    assert(gl,'WebGL');
    const target=await page.evaluate(()=>{
      const app=window.watchQA,world=document.querySelector('.chapter-world-underlay');
      const camera=JSON.parse(world.dataset.worldCamera),rect=world.getBoundingClientRect();
      for(let i=0;i<500;i++){
        const enemy=app.view.battle.enemies.find(e=>e.health>0 && Math.hypot(e.x,e.y)<app.view.config.beam.range*.88);
        if(enemy)return {x:rect.left+camera.x+camera.zoom*enemy.x,y:rect.top+camera.y+camera.zoom*camera.projectionY*enemy.y};
        app.advance(80);
      }
      throw new Error('No threat entered the beam range');
    });
    if(touch)await page.touchscreen.tap(target.x,target.y);else await page.mouse.move(target.x,target.y);
    await page.waitForFunction(()=>window.watchQA.view.battle.litEnemyIds.length>0);
    await shot('10-battle','.is-battle .ocean');
    await hit(action('pause')); await shot('11-pause','.pause-panel');
    await hit('.pause-panel '+action('settings')); await hit('.settings-back');
    const tick=await page.evaluate(()=>window.watchQA.view.battle.tick);
    if(touch){ await page.setViewportSize({width:height,height:width}); await page.setViewportSize({width,height}); }
    assert.equal(await attempt(),id);assert.equal(await page.evaluate(()=>window.watchQA.view.battle.tick),tick);
    await hit(action('confirm-abandon'));await shot('12-confirm','.abandon-confirm');await hit(action('cancel-abandon'));
    await hit(action('resume'));
    const winFirst=extra ? lang==='en' : lang==='ru';
    const outcome=await settle(winFirst);
    assert(['victory','defeat'].includes(outcome),'night settled');
    await shot('13-'+outcome,'.watch-result');assert.equal(await attempt(),undefined);
    assert(await page.evaluate(()=>{
      const {result}=window.watchQA.view;
      const amounts=Array.from(document.querySelectorAll('.outcome-ledger dd'),dd=>Number(dd.textContent.trim()));
      const rewards=amounts.slice(1,-1);
      return amounts.at(-1)===result.totalResources && rewards.reduce((sum,value)=>sum+value,0)===result.totalResources
        && (!result.firstWinShards || rewards.at(-1)===result.firstWinShards);
    }),'visible ledger reconciles with saved result');
    await hit('.watch-result '+action('start'));
    await hit(prep('start'));
    await scope('.is-battle .ocean').waitFor();
    await page.evaluate(()=>{
      const write=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==='lighthouse.campaign.v1' && !JSON.parse(value).activeAttempt) throw new DOMException('Test storage quota','QuotaExceededError');
        return write.call(this,key,value);
      };
      window.restoreWatchStorage=()=>{Storage.prototype.setItem=write;};
    });
    const second=await settle(!winFirst);
    assert.notEqual(outcome,second);
    await shot('14-result-error','.save-error[role="alertdialog"]');
    await hit('.save-error '+action('reload-campaign'));await shot('14b-reload-confirm','.watch-reload[open]');
    await hit('.watch-reload [value="cancel"]');
    assert(await scope('.save-error').isVisible());
    await page.evaluate(()=>window.restoreWatchStorage());
    await hit('.save-error '+action('save'));
    await page.waitForFunction(()=>window.watchQA.view.result.saved && !window.watchQA.view.error);
    await shot('15-'+second,'.watch-result');
    if(second==='victory'){
      await hit('.outcome-actions '+action('select-night'));
      await scope(prep('start')).waitFor();await hit(prep('back'));
    } else {
      await hit('.page-nav '+action('menu'));await hit(action('game-menu'));
    }
    assert(await scope(action('continue-game')).isEnabled());
    if(extra) await shot('game-menu','.game-menu-continue');
    await hit(action('new-game'));await shot('16-reset','.game-menu-confirm');await hit(action('cancel-new-game'));
    assert(await scope(action('continue-game')).isEnabled());
    // Trials are available in the prototype catalog. The campaign keeps its own catalog.
    await page.goto(new URL('/tests/browser/game-menu-frame.html?saved&language='+lang+(size==='large'?'&large':''),url).href);
    await hit('.play-hotspot');await hit(action('trials'));await shot('17-trials','.chronicle-trials');
    if(extra) {
      await hit(prep('chronicle-preview-night'));await shot('trials-locked','.chronicle-trials');
    }
    await hit(prep('close-panel'));await scope('.reference-game-menu').waitFor();
    if(extra) {
      await hit(action('continue-game')); await hit('.prep-shards'); await shot('prep-currency','.prep-drawer');
      await page.goto(new URL('/?rewardTest=1',url).href);
      await hit(action('settings'));await hit('[data-language="'+lang+'"]');await hit('[data-size="'+size+'"]');await hit('.settings-back');
      await hit(action('game-menu'));await hit(action('new-game'));await hit(prep('acknowledge-intro'));
      await hit('.prep-shards');await hit('[data-action="campaign-reward-start"][data-reward-kind="shards"]');
      await shot('reward-test','.campaign-pending');await hit('[data-reward-result="dismissed"]');
    }
    // A late-game profile enables the real final encounter without replaying 55 nights per viewport.
    await page.evaluate(async()=>{
      const {emptyCampaignProfile,decodeCampaignProfile}=await import('/src/application/campaignProfileCodec.ts');
      const {CAMPAIGN_NIGHT_CATALOG}=await import('/src/content/campaignRuntime.ts');
      const {CAMPAIGN_TREE_DRAFT}=await import('/src/content/campaignTreeDraft.ts');
      const {CAMPAIGN_CHAPTER_DRAFT}=await import('/src/content/campaignFoundationDraft.ts');
      const profile=emptyCampaignProfile();
      profile.wonNightIds=CAMPAIGN_NIGHT_CATALOG.slice(0,-1).map(n=>n.id);
      profile.completedNights=profile.wonNightIds.length;
      profile.seenIntroIds=CAMPAIGN_CHAPTER_DRAFT.map(c=>c.introId);
      profile.selectedNightId='fog-heart';profile.selectedLensId='focused';profile.selectedAbilityId='barrage';
      profile.purchasedNodeIds=CAMPAIGN_TREE_DRAFT.map(n=>n.id);
      const {DEVICE_RULES}=await import('/src/content/devices.ts');
      profile.inventory=Object.keys(DEVICE_RULES.definitions).map((kind,i)=>({id:i+1,kind,health:1,consumed:false,...(kind==='light-trap'?{trapCharges:1}:{})}));
      profile.nextDeviceId=profile.inventory.length+1;
      const record=JSON.stringify(profile);
      decodeCampaignProfile(record);
      localStorage.setItem('lighthouse.campaign.v1',record);
    });
    if(extra && lang==='ru' && size==='normal') {
      // Enter each previously unseen chapter through Continue with a validated, isolated campaign profile.
      const finale=await page.evaluate(()=>localStorage.getItem('lighthouse.campaign.v1'));
      for(let chapter=2;chapter<=7;chapter++) {
        await page.evaluate(async ({chapter,finale})=>{
          const {decodeCampaignProfile}=await import('/src/application/campaignProfileCodec.ts');
          const {CAMPAIGN_CHAPTER_DRAFT}=await import('/src/content/campaignFoundationDraft.ts');
          const profile=JSON.parse(finale),entry=CAMPAIGN_CHAPTER_DRAFT[chapter-1];
          profile.selectedNightId=entry.nights[0];profile.seenIntroIds=profile.seenIntroIds.filter(id=>id!==entry.introId);
          const record=JSON.stringify(profile);decodeCampaignProfile(record);localStorage.setItem('lighthouse.campaign.v1',record);
        },{chapter,finale});
        await page.goto(url.href);await hit(action('game-menu'));await hit(action('continue-game'));
        await shot('intro-'+chapter,'#campaign-intro-title');
      }
      await page.evaluate(record=>localStorage.setItem('lighthouse.campaign.v1',record),finale);
    }
    await page.goto(url.href);await bindGame();await hit(action('game-menu'));await hit(action('continue-game'));
    await hit(prep('start'));await page.waitForFunction(()=>window.watchQA?.view.screen==='battle');
    assert.equal(await settle(true),'victory','final night with a developed profile');
    await shot('18-epilogue','.campaign-epilogue');
    assert(await scope('.page-nav').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1),'final navigation clipped');
    if(touch && height>width && size==='large') {
      const shown=await scope('.outcome-actions').evaluate(group=>{
        const bounds=group.getBoundingClientRect(), ledger=group.closest('.outcome-main').getBoundingClientRect();
        return bounds.top>=ledger.top-1 && bounds.bottom<=ledger.bottom+1;
      });
      assert(shown,'epilogue actions visible on entry');
    }
    await hit('.watch-result '+action('campaign-collection'));
    await hit('[data-reward-id="dawn-beacon"][data-action="campaign-select-reward"]');
    await hit('[data-reward-id="dawn-beacon"][data-action="campaign-reward-claim"]');
    await hit('[data-reward-id="dawn-beacon"][data-action="campaign-cosmetic"]');
    await shot('19-equipped','.campaign-collection');
    await hit('.campaign-collection '+action('back'));await scope('.campaign-epilogue').waitFor();
    await hit('.watch-result '+action('start'));await hit(prep('start'));
    await page.waitForFunction(()=>window.watchQA?.view.screen==='battle' && window.watchQA.view.config.campaignAppearance?.beacon==='dawn-beacon');
    await shot('20-final-coast','.is-battle .ocean');
    const secondTab=await context.newPage();await secondTab.goto(url.href);
    await secondTab.locator('.watch-startup button').waitFor();
    assert.equal(await secondTab.locator('html').getAttribute('lang'),lang);
    assert.match(await secondTab.locator('.watch-startup').innerText(),lang==='en'?/another tab/:/другой вкладке/);
    await secondTab.screenshot({scale:artPass?'css':'device',path:path.join(dir,'21-locked-profile.png')});stages.push('21-locked-profile');
    await page.close();
    await secondTab.locator('.watch-startup button').click();
    await secondTab.locator('.menu-title-ready').waitFor();
    assert(await secondTab.evaluate(()=>JSON.parse(localStorage.getItem('lighthouse.campaign.v1')).wonNightIds.includes('fog-heart')));
    assert.deepEqual(errors,[]);assert.deepEqual(untranslated,{});
    return {name,stages,outcome};
  } catch(error){
    await page.screenshot({scale:artPass?'css':'device',path:path.join(dir,'failure.png')}).catch(()=>{});
    return {name,stages,untranslated,errors,failure:String(error),visible:await page.locator('body').innerText().catch(()=>'' )};
  } finally {await context.close();}
}
const titles={
  ...Object.fromEntries(Array.from({length:7},(_,i)=>['intro-'+(i+1),'Вступление · глава '+(i+1)])),
  'intro-replay':'Повтор вступления','settings-error':'Ошибка настроек','upgrades-locked':'Закрытая покупка',
  'chronicle-chapters':'Главы','game-menu':'Продолжение игры','trials-locked':'Закрытое испытание',
  'prep-lens':'Линза','prep-ability':'Способность','prep-recon':'Разведка','prep-currency':'Баланс',
  'reward-offer':'Добровольная награда','reward-test':'Тестовое предложение',
  '01-menu':'Главное меню','02-settings':'Настройки','03-game-menu':'Выбор игры','04-intro':'Вступление',
  '05-preparation':'Подготовка','06-chronicle':'Хроника','07-devices':'Устройства','08-development':'Древо',
  '09-collection':'Коллекция','10-battle':'Бой','11-pause':'Пауза','12-confirm':'Прерывание',
  '13-victory':'Победа','15-victory':'Победа','13-defeat':'Поражение','15-defeat':'Поражение',
  '14-result-error':'Ошибка сохранения','14b-reload-confirm':'Подтверждение загрузки',
  '16-reset':'Новая игра','17-trials':'Испытания прототипа','18-epilogue':'Эпилог','19-equipped':'Маяк рассвета','20-final-coast':'Последний берег','21-locked-profile':'Профиль открыт в другой вкладке'
};
function gallery(results) {
  const devices=Object.fromEntries(formats.map(([id,w,h])=>[id,(id==='desktop'?'ПК':'Телефон')+' '+w+' × '+h]));
  const sections=results.map(result=>{
    const [device,language,size]=result.name.split('-');
    const cards=result.stages.map(stage=>{
      const file=result.name+'/'+stage+'.png';
      return '<figure><a href="'+file+'"><img loading="lazy" src="'+file+'" alt="'+titles[stage]+'"></a><figcaption>'+titles[stage]+'</figcaption></figure>';
    }).join('');
    return '<details><summary>'+devices[device]+' · '+language.toUpperCase()+' · '+(size==='large'?'крупный':'обычный')+'</summary><div>'+cards+'</div></details>';
  }).join('');
  return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Свет Авалона · Проверка переходов</title><style>body{background:#102337;color:#ffe3ad;font:18px Georgia,serif;max-width:1440px;margin:auto;padding:1.5rem}h1{font-weight:400}summary{cursor:pointer;padding:1em 0;border-top:1px solid #786453}div{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));margin:12px 0 25px}figure{margin:0}img{width:100%;height:180px;object-fit:contain;background:#091724}figcaption{padding:4px}details:first-of-type summary{color:#ffcf81}</style><h1>Свет Авалона · Проверка переходов</h1>'+sections+'</html>';
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const server=process.env.LIGHTHOUSE_TEST_URL ? null : await (await import('vite')).createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error'});
  if(server){await server.listen();url.href=server.resolvedUrls.local[0];}
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
  const results=[];
  try {
    for(const size of ['normal','large'])for(const lang of ['ru','en'])for(const format of formats){
      const key=[format[0],lang,size].join('-');
      if(process.env.WATCH_CASE && !key.includes(process.env.WATCH_CASE))continue;
      const r=await scenario(browser,format,lang,size);results.push(r);
      console.log(r.name, r.failure||r.outcome, r.stages.at(-1), JSON.stringify(r.untranslated||{}));
      await fs.writeFile(path.join(out,process.env.WATCH_CASE?'sample-'+process.env.WATCH_CASE+'.json':'verification.json'),JSON.stringify(results,null,2));
    }
    if(!process.env.WATCH_CASE)await fs.writeFile(path.join(out,'index.html'),gallery(results));
    if(results.some(r=>r.failure))process.exitCode=1;
  }finally{await browser.close();await server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
