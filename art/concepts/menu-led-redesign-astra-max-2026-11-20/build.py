"""Rebuild the design package, or validate its native layouts into a separate output root."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/"source"))
import material as m
from layout import Board,DEVICES
from progress import cutaways
from scenes import SCENES
from lettering import face
from indices import generate_indices

VIEWS=("ru-normal","ru-large","en-normal","en-large")
GROUPS={
    "navigation":["menu","game-select","settings","chronicle-chapters"],
    "chronicle":["menu","chronicle-chapters","chronicle-nights","trials"],
    "journal-first":["chronicle-nights","story-01","story-02","story-03"],
    "journal-coasts":["story-04","story-05","story-06","story-07"],
    "landfall":["menu","story-01","preparation","battle"],
    "equipment":["preparation","devices","lens","ability"],
    "maintenance":["preparation","placement","service","invalid-placement"],
    "upgrades":["preparation","development","purchase","prototype-tree"],
    "rewards":["purchase-locked","collection","currency","reward-test"],
    "combat":["preparation","battle","boss","device-command"],
    "defense":["scouting","battle","target-ability","pause"],
    "outcomes":["boss","victory","defeat","epilogue"],
    "decisions":["game-select","confirm-new","pause","confirm-abandon"],
    "recovery":["save-error","reload-confirm","settings-error","profile-lock"],
    "return":["menu","new-profile","interrupted","preparation"],
    "prototype":["prototype-select","trials","trial-modes","prototype-tree"],
    "battle-states":["battle","battle-shield","target-ability","device-command"],
    "replay":["chronicle-nights","story-01","preparation","story-replay"],
}
def board_path(out,view,device,key):
    return out/("boards" if view=="ru-normal" else "locales/"+view)/device/(key+".png")

def sheet(out,name,device,keys):
    ww,hh=DEVICES[device][0];bar=34
    im=Image.new("RGB",(2*ww,2*(hh+bar)),"#0a1b2c")
    fonts={s:face(s) for s in [17,19]}
    for i,key in enumerate(keys):
        x=(i%2)*ww;y=(i//2)*(hh+bar)
        path=ROOT/"reference"/(device+".png") if key=="menu" else board_path(out,"ru-normal",device,key)
        with Image.open(path) as pic:im.paste(pic,(x,y+bar))
        name_ru="Главное меню · эталон" if key=="menu" else next(s[1] for s in SCENES if s[0]==key)
        d=ImageDraw.Draw(im);d.text((x+10,y+3),name_ru,font=fonts[19],fill="#ffe3ad")
    dest=out/"sheets"/device;dest.mkdir(parents=True,exist_ok=True)
    im.save(dest/f"{name}.png",compress_level=5)

def reference_sheet(out):
    ddir=out/"sheets";ddir.mkdir(parents=True,exist_ok=True)
    im=Image.new("RGB",(782,553),"#0d2136");d=ImageDraw.Draw(im)
    def cap(x,y,msg):d.text((x,y),msg,font=face(16),fill="#ffe3ad")
    cap(12,6,"Главное меню / исходный пиксель 1:1")
    for row,(name,box) in enumerate([("frame-states",(0,0,240,48)),("frame-states",(240,0,480,48)),("frame-states",(480,0,720,48)),
                         ("labels-ru",(0,0,240,48)),("labels-en",(240,0,480,48))]):
        src=Image.open(m.MASTERS/f"menu/{name}.png").crop(box).convert("RGBA")
        im.paste(src,(15,39+row*50),src)
    cap(286,47,"Покой");cap(286,97,"Наведение");cap(286,147,"Нажатие");cap(286,197,"Подпись RU");cap(286,247,"Подпись EN")
    cap(12,301,"Новые элементы / тот же исходный пиксель")
    for i,(key,name) in enumerate([("button-primary-idle","Основная"),("button-quiet-idle","Вторичная"),("button-primary-focus","Фокус")]):
        x=12;y=334+i*54
        patch=m.sliced(key,(240,48));im.paste(patch,(x,y),patch);cap(285,y+7,name)
    cap(438,7,"Цвета интерфейса")
    for i,(color,label) in enumerate([(m.INK,"Контур"),(m.NAVY,"Камень"),(m.STEEL,"Холодная кромка"),(m.COPPER,"Медь"),(m.GOLD,"Свет"),(m.IVORY,"Блик"),(m.PAPER,"Пергамент"),(m.TEAL,"Выбор"),(m.RED,"Угроза")]):
        y=40+i*26;d.rectangle((441,y,465,y+18),fill=color);cap(473,y-2,f"{color}    {label}")
    cap(438,302,"Пиктограммы и индикаторы")
    for i,key in enumerate([k for k in m.SPRITES if k.startswith("icon-")]):
        src=m.SPRITES[key];im.paste(src,(443+(i%9)*30,340+(i//9)*30),src)
    cap(12,510,"Нативная рамка меню 240 × 48, новая растягиваемая рамка с полями 9-slice.")
    im.save(ddir/"native-detail.png")

def main():
    arg=argparse.ArgumentParser(description=__doc__)
    arg.add_argument("--out",type=Path,default=ROOT)
    arg.add_argument("--layout-only",action="store_true",help="check all native layouts, no exports")
    arg.add_argument("--view",choices=VIEWS,action="append");arg.add_argument("--scene",action="append")
    args=arg.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    views=args.view or VIEWS;subset=set(args.scene or [s[0] for s in SCENES])
    unknown=subset-{s[0] for s in SCENES}
    if unknown:arg.error(f"Unknown states: {unknown}")
    m.prepare();cutaways()
    if not args.layout_only:m.exports(out)
    errors=[];results=[];logs={}
    for view in views:
        lang,mode=view.split("-")
        for device in DEVICES:
            for key,name,renderer,params in SCENES:
                if key not in subset:continue
                try:
                    b=Board(device,lang,mode=="large",key)
                    renderer(b,*params)
                    if not args.layout_only:
                        dst=board_path(out,view,device,key);dst.parent.mkdir(parents=True,exist_ok=True)
                        b.finish().save(dst,compress_level=4)
                        with Image.open(dst) as check:
                            assert check.size==b.target and check.mode=="RGB"
                        results.append({"path":dst.relative_to(out).as_posix(),"size":b.target,"native":b.size,
                                        "textBoxes":len(b.textlog),"textLines":sum(t["lines"] for t in b.textlog),"buttons":len(b.hit)})
                    else:results.append([view,device,key])
                    logs[f"{view}/{device}/{key}"]={"controls":b.hit,"minimumBody":min((t["size"] for t in b.textlog if t["style"]=="body"),default=0)}
                except Exception as exc:errors.append([view,device,key,str(exc)])
    print(f"{len(results)} successful layouts; {len(errors)} errors",flush=True)
    for item in errors[:160]:print(" / ".join(item))
    audit=out/"audit";audit.mkdir(exist_ok=True)
    (audit/("layout-errors.json" if args.layout_only else "export-errors.json")).write_text(json.dumps(errors,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    if errors:return 1
    if args.layout_only:return 0
    if not args.scene and "ru-normal" in views:
        for device in DEVICES:
            for name,group in GROUPS.items():sheet(out,name,device,group)
        reference_sheet(out)
        generate_indices(out,SCENES,DEVICES,GROUPS)
    (audit/"layout.json").write_text(json.dumps({"boards":results,"controls":logs},ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"{len(m.SPRITES)} transparent sprites, {len(m.PLATES)} illustrations, {len(m.TILES)} material tiles.")
    return 0

if __name__=="__main__":sys.exit(main())
