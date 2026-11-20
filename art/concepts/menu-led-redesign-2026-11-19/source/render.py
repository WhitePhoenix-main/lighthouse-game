"""Render or validate the package without starting the game. Requires Pillow 13."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw
from details import *

TARGETS={'desktop':((640,360),(1280,720)),'phone-landscape':((779,360),(844,390)),'phone-portrait':((296,640),(390,844))}
FLOWS={
    'entry':['menu','game-select','settings','reset-confirm'],
    'journal':['menu','chronicle','story-01','preparation'],
    'watch':['menu','preparation','battle','pause'],
    'outcomes':['menu','victory','defeat','epilogue'],
    'purchases':['menu','development','purchase','collection'],
    'trials':['menu','game-select','trials','chronicle-index'],
    'tree':['menu','skill-tree','development','purchase'],
    'finale':['menu','victory','epilogue','epilogue-result'],
    'field':['menu','preparation','battle-boss','battle-command'],
}
LABELS={'menu':'Главное меню','game-select':'Выбор игры','settings':'Настройки','reset-confirm':'Подтверждение','chronicle':'Хроника','story-01':'Запись смотрителя','preparation':'Подготовка','battle':'Бой','pause':'Пауза','victory':'Победа','defeat':'Поражение','epilogue':'Эпилог','development':'Развитие','purchase':'Покупка','collection':'Коллекция','trials':'Испытания','chronicle-index':'Оглавление'}
LABELS.update({'skill-tree':'Древо прототипа','epilogue-result':'Итог финальной ночи','battle-boss':'Страж глубин','battle-command':'Приказ пушке'})
def jwrite(dst,doc):
    dst.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def write_image(im,dst):
    dst.parent.mkdir(parents=True,exist_ok=True);im.convert('RGB').save(dst)
def comparison(out):
    for target,(logical,physical) in TARGETS.items():
        for flow,ids in FLOWS.items():
            thumb=(512,288) if target=='desktop' else (520,240) if target=='phone-landscape' else (234,506)
            tw,th=thumb;cols=4 if target=='phone-portrait' else 2;rows=4//cols
            sw=cols*(tw+12)+12;sh=rows*(th+40)+10;im=Image.new('RGB',(sw,sh),INK);d=ImageDraw.Draw(im)
            for i,key in enumerate(ids):
                f=(out/'reference'/f'{target}.png') if key=='menu' else out/'mockups'/target/(key+'.png')
                src=Image.open(f).convert('RGB').resize(thumb,NEAR);x=12+(i%cols)*(tw+12);y=8+(i//cols)*(th+40)
                d.text((x,y),LABELS[key],font=font('label',17),fill=GOLD)
                im.paste(src,(x,y+26))
            write_image(im,out/'comparisons'/f'{flow}-{target}.png')

def render(out,check=False):
    build();out.mkdir(exist_ok=True,parents=True)
    issues=[];manifest={'screens':list(SCENES),'targets':{},'images':[],'stressSamples':[]}
    if not check:
        export(out);rdir=out/'reference';rdir.mkdir(exist_ok=True)
        import shutil
        if out.resolve()!=ROOT.resolve():
            shutil.copytree(ROOT/'art-source',out/'art-source',dirs_exist_ok=True)
            for f in (ROOT/'reference').glob('*'):
                if f.is_file():shutil.copy2(f,rdir/f.name)
    for target,(logical,physical) in TARGETS.items():
        manifest['targets'][target]={'logical':logical,'viewport':physical}
        for key,maker in SCENES.items():
            for lang,large in [('ru',False),('en',False),('ru',True),('en',True)]:
                p=Page(*logical,lang,large);maker(p)
                issues.extend([(target,key,lang,large,*issue) for issue in p.issues])
                if not check and ((lang=='ru' and not large) or (key in ('settings','story-03','battle','purchase','abandon-confirm') and (lang=='en' or large))):
                    if lang=='ru' and not large:dst=f'mockups/{target}/{key}.png';manifest['images'].append(dst)
                    else:
                        dst=f'accessibility/{lang}-{"large" if large else "normal"}/{target}/{key}.png'
                        manifest['stressSamples'].append(dst)
                    write_image(p.im.resize(physical,NEAR),out/dst)
    if MISSING:issues.append(('missing-en',sorted(MISSING)))
    if not check:
        from proofs import proof
        proof(out);comparison(out);manifest['comparisons']=[str(f.relative_to(out)).replace('\\','/') for f in sorted((out/'comparisons').glob('*.png'))]
        from verify import hashfile
        groups=('mockups','art-source','illustrations','sprites','reference','comparisons','accessibility')
        manifest['sha256']={f.relative_to(out).as_posix():hashfile(f) for group in groups for f in sorted((out/group).rglob('*')) if f.is_file()}
        jwrite(out/'manifest.json',manifest)
    print('screen states:',len(SCENES),'layout variants:',len(SCENES)*3*4,'issues:',len(issues))
    for item in issues[:120]:print(str(item).encode('utf8','backslashreplace').decode('utf8'))
    if issues:raise SystemExit(1)
    from verify import verify
    verify(out,SCENES,TARGETS)
if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf8')
    a=argparse.ArgumentParser();a.add_argument('--out',type=Path,default=ROOT);a.add_argument('--check',action='store_true')
    args=a.parse_args();render(args.out,args.check)

