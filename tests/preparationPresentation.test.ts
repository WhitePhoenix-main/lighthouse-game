import {describe,expect,it} from 'vitest';
import {LighthouseApplication} from '../src/application/gameApplication';
import {NIGHT_CONFIG} from '../src/content/night';
import {NIGHT_CATALOG} from '../src/content/nights';
import {emptySave} from '../src/application/saves';
import {createPreparationUiState} from '../src/presentation/preparation/preparationState';
import {preparationInvalidPlacements,preparationScreen} from '../src/presentation/preparation/preparationScreen';
import {preparationGestureIsTap} from '../src/presentation/preparation/preparationControls';
import {chroniclePage,openChronicle,selectChronicleChapter} from '../src/presentation/preparation/chronicleState';
import {checkPlacement} from '../src/application/placement';
import {campaignChapterIntro} from '../src/content/campaignIntros';
import {campaignStoryCard} from '../src/presentation/preparation/campaignStoryCard';

const details={lenses:'<button data-action="select-lens" data-lens="basic">LENS OPTIONS</button>',lateModes:'<section>LATE MODES</section>',waves:'<li>KNOWN ENEMIES</li>'};
function application(){const save=emptySave();save.profile.resources=136;save.profile.bossMaterials=3;return new LighthouseApplication({read:()=>JSON.stringify(save),write:()=>{}},NIGHT_CONFIG,()=>({id:'prep-test',seed:1}),undefined,NIGHT_CATALOG);}
describe('live preparation presentation',()=>{
  it('uses actual resources and campaign context and mounts one live world instead of an example screenshot',()=>{
    const app=application();app.openPreparation();const state=createPreparationUiState(),html=preparationScreen(app.view,state,details);
    expect(html).toContain('data-prep-world');expect(html.match(/data-prep-world/g)).toHaveLength(1);
    expect(html).not.toContain('data-placement-map');expect(html).not.toContain('responsive-v4');expect(html).not.toContain('mobile.png');
    expect(html).toContain('136');expect(html).toContain('Первый свет');
    expect(html.replace(/<[^>]*>/g,'')).toContain(`Объекты ${app.view.preparation.placements.length}/${app.view.config.devices.maxObjects}`);
    expect(html).toContain('data-panel="shards"');expect(html).toContain('data-panel="pearls"');expect(app.view.screen).toBe('preparation');
  });
  it.each(['devices','lens','ability','recon','night','shards','pearls'] as const)('opens an accessible %s dialog without issuing application commands',panel=>{
    const app=application();app.openPreparation();const before=JSON.stringify(app.view.profile),state=createPreparationUiState();state.panel=panel;
    const html=preparationScreen(app.view,state,details);expect(html).toContain('role="dialog" aria-modal="true"');expect(html).toContain('data-prep-action="close-panel"');expect(JSON.stringify(app.view.profile)).toBe(before);
    if(panel==='devices')for(const kind of Object.keys(app.view.config.devices.definitions))expect(html).toContain(`data-kind="${kind}"`);
    if(panel==='night'){
      expect(html).toContain('Хроника маяка');expect(html).toContain('data-prep-action="chronicle-contents"');
      expect(html).toContain('Требуется победа: Первый свет');expect(html).toContain('data-prep-action="confirm-night"');
      expect(html).toMatch(/data-prep-action="chronicle-preview-night"\s+data-night="broken-shore"/);expect(html).not.toContain('data-prep-world');
      expect(html).not.toContain('data-chronicle-night="rescue-trial"');
    }
    if(panel==='lens')expect(html).toContain('LENS OPTIONS');
    if(panel==='recon'){expect(html).toContain('KNOWN ENEMIES');expect(html).toContain('Характеристики маяка');expect(html).toContain('LATE MODES');}
    if(panel==='shards'||panel==='pearls'){expect(html).toContain('Получение валюты за просмотр видео пока недоступно.');expect(html).not.toContain('SDK');expect(html).not.toContain('data-prep-action="claim');}
  });
  it('blocks start and all catalogue mutations after a save failure',()=>{
    const app=application();app.openPreparation();app.view.error='Запись не удалась';const state=createPreparationUiState();state.panel='devices';
    const html=preparationScreen(app.view,state,details);
    for(const action of ['start','development','purchase-device','device-type']){
      const buttons=html.match(new RegExp(`<button[^>]*data-prep-action="${action}"[^>]*>`,'g'));expect(buttons?.length).toBeGreaterThan(0);for(const tag of buttons??[])expect(tag).toContain('disabled');
    }
  });
  it('marks legacy placements using the same pure placement authority and offers move without dropping the owned body',()=>{
    const app=application();app.openPreparation();app.view.preparation.placements=[{id:51,kind:'cannon',x:230,y:0}];const state=createPreparationUiState();state.selectedDeviceId=51;
    const expected=checkPlacement(app.view.config,[],'cannon',230,0);expect(expected.valid).toBe(false);
    expect(preparationInvalidPlacements(app.view)).toEqual([{id:51,reason:expected.reason}]);
    const html=preparationScreen(app.view,state,details);expect(html).toContain('data-prep-action="move-device"');expect(html).toContain(expected.reason);expect(html).toMatch(/data-prep-action="start" disabled/);
    expect(app.view.preparation.placements).toHaveLength(1);
  });
  it('escapes user-facing campaign names in preparation and in the chronicle',()=>{
    const app=application();app.openPreparation();const night=app.view.nights.find(n=>n.id===app.view.selectedNightId)!;night.name='<img src=x onerror=alert(1)>';
    const html=preparationScreen(app.view,createPreparationUiState(),details);expect(html).toContain('&lt;img');expect(html).not.toContain('<img src=x');
    const chronicle=preparationScreen(app.view,{...createPreparationUiState(),panel:'night'},details);
    expect(chronicle).toContain('&lt;img');expect(chronicle).not.toContain('<img src=x');
  });
  it('does not treat a scroll or drag as a placement tap',()=>{
    expect(preparationGestureIsTap(3,4)).toBe(true);expect(preparationGestureIsTap(0,9)).toBe(false);expect(preparationGestureIsTap(40,0)).toBe(false);
  });
  it('opens on the sheet containing the current night in a chapter with more than four nights', () => {
    const app = application();
    const view = app.view;
    const chapter = view.nights[0]!.chapter;
    view.nights = view.nights.map(night => ['far-shore', 'armored-front'].includes(night.id)
      ? {...night, chapter, available:true, optional:false} : night);
    view.selectedNightId = 'far-shore';
    const selection = openChronicle(view)!;
    expect(selection).toMatchObject({kind:'campaign', page:1, nightId:'far-shore'});
    expect(chroniclePage(view, selection)?.nights.map(night => night.id)).toEqual(['far-shore','armored-front']);
    const previous = chroniclePage(view, {...selection, page:0});
    expect(previous?.nights).toHaveLength(4);
    expect(previous?.selected).toBeUndefined();
    expect(selection.nightId).toBe('far-shore');
    expect(chroniclePage(view, selection)?.selected?.id).toBe('far-shore');
  });
  it('keeps locked chapters browsable and gives optional nights their own volume', () => {
    const app = application();
    const selection = openChronicle(app.view)!;
    const locked = selectChronicleChapter(app.view, {...selection, contents:true}, '2');
    expect(locked).toMatchObject({chapterId:'2', contents:false, nightId:null, page:0});
    expect(chroniclePage(app.view, locked)?.nights.map(night => night.reason)).toEqual(['Требуется победа: Страж глубин']);
    const trials = openChronicle(app.view,'trials')!;
    expect(chroniclePage(app.view,trials)?.nights.every(night => night.optional)).toBe(true);
    expect(chroniclePage(app.view,trials)?.selected).toBeUndefined();
  });
  it.each([1, 2, 3, 4, 5, 6, 7])('renders the full bilingual chapter %i and its own illustration', chapter => {
    const intro = campaignChapterIntro(chapter - 1)!;
    for (const language of ['ru', 'en'] as const) {
      const firstVisit = campaignStoryCard(intro, language, false, false);
      expect(firstVisit).toContain(`images/avalon-watch/illustrations/intro-${chapter}.png`);
      expect(firstVisit).toContain(intro[language]);
      expect(firstVisit.match(/data-prep-action="acknowledge-intro"/g)).toHaveLength(2);
      const replay = campaignStoryCard(intro, language, true, false);
      expect(replay).toContain('data-prep-action="close-intro-replay"');
      expect(replay).not.toContain('data-prep-action="acknowledge-intro"');
    }
  });
});
