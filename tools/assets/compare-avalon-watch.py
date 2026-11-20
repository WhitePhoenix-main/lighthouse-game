"""Pair actual Chrome frames with the approved raster compositions at their native dimensions."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / 'art/concepts/avalon-watch'
SHOTS = ROOT / 'test-results/watch-art-audit'
DEST = ROOT / 'art/reviews/avalon-watch'
FONT = ROOT / 'public/fonts/menu/VollkornSC-Regular.ttf'
DEVICES = {'desktop': ('ПК', 1280, 720), 'portrait': ('Телефон, портрет', 360, 640),
           'landscape': ('Телефон, альбом', 720, 360)}
SCREENS = {
    'main-menu':'Главное меню', 'game-menu-new':'Выбор игры', 'game-menu':'Продолжение игры',
    'settings':'Настройки', 'settings-error':'Ошибка настроек', 'confirm-new':'Подтверждение новой игры',
    'chronicle':'Хроника', 'chronicle-chapters':'Главы', 'trials':'Испытания', 'trials-locked':'Закрытое испытание',
    **{f'intro-{i}':f'Вступление · глава {i}' for i in range(1,8)}, 'intro-replay':'Повтор вступления',
    'preparation':'Подготовка', 'prep-catalog':'Каталог устройств', 'prep-recon':'Разведка', 'prep-lens':'Линза',
    'prep-ability':'Способность', 'prep-currency':'Баланс осколков', 'placement-move':'Перестановка',
    'placement-invalid':'Недопустимая позиция', 'upgrades':'Древо улучшений', 'upgrades-locked':'Закрытая покупка',
    'collection':'Коллекция', 'collection-equipped':'Применённое оформление', 'reward-offer':'Добровольная награда',
    'reward-test':'Тестовая награда', 'battle':'Бой', 'battle-device':'Команда устройства', 'battle-boss':'Страж глубин',
    'pause':'Пауза', 'abandon':'Прерывание ночи', 'victory':'Победа', 'defeat':'Поражение',
    'result-error':'Ошибка записи результата', 'epilogue':'Эпилог'
}
WORLD = {'preparation', 'prep-catalog','prep-ability','prep-lens','prep-recon', 'placement-move', 'placement-invalid', 'battle', 'battle-device', 'battle-boss'}
WORKSHOP = {'chronicle','chronicle-chapters','trials','trials-locked','upgrades','upgrades-locked','collection','collection-equipped'}
STAGES = {'main-menu':'01-menu','game-menu-new':'03-game-menu','settings':'02-settings','confirm-new':'16-reset',
          'intro-1':'04-intro','prep-catalog':'07-devices','pause':'11-pause','abandon':'12-confirm',
          'result-error':'14-result-error','epilogue':'18-epilogue'}
NOTES = {
    'prep-catalog':'Каталог третьей ночи. В профиле находятся пушка №7 и барьер №8.',
    'prep-currency':'Баланс осколков в докампанейском прототипе.',
    'reward-test':'Локальный стенд имитирует ответ сервиса наград.',
    'trials':'Доска испытаний доступна в докампанейском прототипе.',
    'trials-locked':'В прототипе выбран недоступный наряд.',
    'result-error':'Стенд вызвал ошибку записи реального результата. Диагностика относится к этому сбою.',
    'battle':'Реальный бой третьей ночи. Момент волны, здоровье и направление луча зависят от хода боя.',
    'battle-boss':'Тело и два щупальца расположены по текущим зонам попадания Стража.',
    'victory':'В игре базовая награда и доплата за первую победу отражены отдельно.',
    'epilogue':'Полная победа над Сердцем тумана открывает награду в коллекции.',
}
def make_pair(device, slug, stage_names):
    title, w, h = DEVICES[device]
    if slug in WORLD:
        real = SHOTS/'world'/device/(slug+'.png')
    elif slug in WORKSHOP:
        real = SHOTS/'workshop'/(device+'-ru-normal')/(slug+'.png')
    else:
        stage = next((name for name in stage_names if name.endswith('-'+slug) and name.startswith(('13-','15-'))), None)
        stage = stage or STAGES.get(slug,slug)
        if stage not in stage_names:
            raise ValueError(f'Stage missing from completed run: {stage}')
        real = SHOTS/'after'/(device+'-ru-normal')/(stage+'.png')
    reference = KIT/'reference'/(device+'.png') if slug=='main-menu' else KIT/'mockups/ru-normal'/device/(slug+'.png')
    header,gap = (48,12) if w>=1000 else (40,8)
    pair = Image.new('RGB',(w*2+gap,h+header),'#142638')
    for i,(label,png) in enumerate([('Макет',reference),('Игра',real)]):
        with Image.open(png) as frame:
            if frame.size != (w,h): raise ValueError(f'{png}: {frame.size} expected {(w,h)}')
            pair.paste(frame.convert('RGB'),(i*(w+gap),header))
        draw = ImageDraw.Draw(pair)
        draw.text((i*(w+gap)+10,header//2),label,fill='#ffe3ad',font=ImageFont.truetype(str(FONT),20),anchor='lm')
        draw.text((i*(w+gap)+w-10,header//2),f'{title} · {w}×{h}',fill='#bbccd2',font=ImageFont.truetype(str(FONT),15),anchor='rm')
    directory=DEST/device
    directory.mkdir(parents=True,exist_ok=True)
    pair.save(directory/(slug+'.png'))

def main():
    report=json.loads((SHOTS/'after/verification.json').read_text(encoding='utf-8'))
    if len(report)!=12 or any(r.get('failure') for r in report): raise ValueError('The completed 12-case browser run is required.')
    for device in DEVICES:
        stages=next(r['stages'] for r in report if r['name']==device+'-ru-normal')
        for slug in SCREENS: make_pair(device,slug,stages)
    # Same title and crop in each frame. Nearest-neighbour enlargement exposes the actual ink steps.
    crop=(716,34,1086,88)
    baseline=DEST/'before-title.png'
    original=SHOTS/'before/desktop-ru-normal/03-game-menu.png'
    if original.exists():
        with Image.open(original) as frame: frame.crop(crop).save(baseline)
    samples=[('До правки', baseline),
             ('Макет',KIT/'mockups/ru-normal/desktop/game-menu-new.png'),
             ('После правки',SHOTS/'after/desktop-ru-normal/03-game-menu.png')]
    lettering=Image.new('RGB',(760,3*139),'#142638')
    for i,(label,image) in enumerate(samples):
        draw=ImageDraw.Draw(lettering)
        draw.text((12,i*139+2),label,font=ImageFont.truetype(str(FONT),18),fill='#ffe3ad')
        with Image.open(image) as frame:
            title=(frame if image==baseline else frame.crop(crop)).resize((740,108),Image.Resampling.NEAREST)
        lettering.paste(title,(10,i*139+27))
    lettering.save(DEST/'lettering.png')
    html='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Свет Авалона · Макет и игра</title><style>*{box-sizing:border-box}body{margin:0 auto;padding:1rem;max-width:1800px;background:#0e1c2c;color:#ffe3ad;font:16px system-ui,sans-serif}header{display:flex;flex-wrap:wrap;gap:1rem;align-items:baseline}h1{font:normal 26px Georgia,serif;margin:.25em 0}select{padding:.45rem;color:#ffe3ad;background:#172f43;border:1px solid #896242;font-size:inherit}label{display:inline-grid;gap:.3em}figure{margin:1rem 0}img{display:block;max-width:100%;max-height:80vh;width:auto;height:auto;image-rendering:pixelated}a{color:#b1d7e0}figcaption{margin-top:.65rem}nav{display:flex;gap:1rem;flex-wrap:wrap}.hint{color:#bbccd2}</style>
<header><h1>Свет Авалона · Макет и игра</h1><label>Экран<select id="screen"></select></label><label>Устройство<select id="device"></select></label></header>
<figure><a id="full"><img id="frame" alt=""></a><figcaption id="note"></figcaption></figure><nav><a id="png">Открыть PNG в исходном размере</a><a id="source">Открыть исходный макет</a><a href="README.md">Итоги сверки</a></nav>
<script>const screens=SCREENS,devices=DEVICES,notes=NOTES;
const get=id=>document.getElementById(id),screenMenu=get('screen'),deviceMenu=get('device');
for(const [k,v] of Object.entries(screens))screenMenu.add(new Option(v,k));
for(const [k,v] of Object.entries(devices))deviceMenu.add(new Option(v[0]+' · '+v[1]+'×'+v[2],k));
function show(){const p=new URLSearchParams(location.hash.slice(1));const s=p.get('screen') in screens?p.get('screen'):'battle';const d=p.get('device') in devices?p.get('device'):'desktop';
screenMenu.value=s;deviceMenu.value=d;const path=d+'/'+s+'.png';get('frame').src=path;get('frame').alt=screens[s]+' — слева макет, справа игровой кадр';get('png').href=get('full').href=path;get('note').textContent=notes[s]||'';get('source').href='../../concepts/avalon-watch/'+(s==='main-menu'?'reference/'+d+'.png':'mockups/ru-normal/'+d+'/'+s+'.png');}
for(const m of [screenMenu,deviceMenu])m.onchange=()=>location.hash=new URLSearchParams({screen:screenMenu.value,device:deviceMenu.value});
addEventListener('hashchange',show);show();</script></html>'''
    for token,items in [('SCREENS',SCREENS),('DEVICES',DEVICES),('NOTES',NOTES)]:
        html=html.replace(token,json.dumps(items,ensure_ascii=False))
    (DEST/'index.html').write_text(html,encoding='utf-8')
if __name__=='__main__': main()
