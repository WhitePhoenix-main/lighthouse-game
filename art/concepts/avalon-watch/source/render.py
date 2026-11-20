"""Build the design package from layered art. Run from the repository with Python and Pillow."""
import argparse, json
from pathlib import Path
from PIL import Image, ImageDraw
from kit import ROOT, UI, N, C, font, export, sprite
from front import rail
import front,journal,world

DEVICES={"desktop":(640,360,2),"landscape":(720,360,1),"portrait":(360,640,1)}
VARIANTS=("ru-normal","ru-large","en-normal","en-large")
SHEETS={
  "01-entry":["menu","game-menu-new","game-menu","confirm-new","settings","settings-error"],
  "02-records":["menu","preparation","chronicle","chronicle-chapters","intro-replay","intro-1"],
  "03-trials":["menu","game-menu","trials-locked","trials"],
  "04-economy":["menu","preparation","upgrades","upgrades-locked","collection","collection-equipped"],
  "05-coast":["menu","preparation","battle","placement-invalid","placement-move","battle-device"],
  "06-watch":["menu","battle","pause","battle-boss","abandon","defeat"],
  "07-dawn":["menu","victory","epilogue","result-error","settings","intro-7"],
  "08-chapters":["intro-1","intro-2","intro-3","intro-4","intro-5","intro-6","intro-7","epilogue"],
  "09-loadout":["preparation","prep-catalog","prep-lens","prep-ability","prep-recon","prep-currency"],
  "10-rewards":["menu","collection","reward-offer","reward-test"]
}

def resize(im,size):
    return im.resize(size,Image.Resampling.NEAREST)

def capture(name,device,variant):
    if name=="menu":return ROOT/"reference"/(device+".png")
    return ROOT/"mockups"/variant/device/(name+".png")

def sheet(path,images,labels,sw,sh,cols,title):
    pad=12;rows=(len(images)+cols-1)//cols
    im=Image.new("RGB",(pad+(sw+pad)*cols,54+(sh+34)*rows+pad),"#0c1927");d=ImageDraw.Draw(im)
    d.text((pad,10),title,font=font(21),fill=C["gold"])
    d.line((pad,43,im.width-pad,43),fill="#70533d")
    for i,(img,label) in enumerate(zip(images,labels)):
        x=pad+(i%cols)*(sw+pad);y=55+(i//cols)*(sh+34)
        im.paste(resize(img,(sw,sh)),(x,y))
        size=14
        while font(size).getlength(label)>sw-6 and size>10:size-=1
        d.text((x+1,y+sh+3),label,font=font(size),fill=C["ink"])
    path.parent.mkdir(parents=True,exist_ok=True);im.save(path)

def comparisons(screens):
    folder=ROOT/"comparisons"
    for device,(w,h,k) in DEVICES.items():
        for name,items in SHEETS.items():
            missing=[slug for slug in items if slug!="menu" and slug not in screens]
            if missing:raise ValueError((name,missing))
            images=[Image.open(capture(slug,device,"ru-normal")) for slug in items]
            labels=["Главное меню · браузер" if slug=="menu" else screens[slug] for slug in items]
            sheet(folder/device/(name+".png"),images,labels,w,h,3 if device!="portrait" else 4,{"desktop":"ПК","landscape":"Телефон · горизонтально","portrait":"Телефон · вертикально"}[device]+"   /   "+"Береговая вахта")
            for im in images:im.close()
    items=["menu","chronicle","preparation","intro-3","battle","epilogue"]
    sheet(ROOT/"overview.png",[Image.open(capture(slug,"desktop","ru-normal")) for slug in items],
          ["Главное меню · эталон" if s=="menu" else screens[s] for s in items],640,360,3,"Свет Авалона   /   Береговая вахта")

def components():
    ui=UI(640,440);ui.text(18,15,"Кнопки и материалы",24,"gold")
    for i,style in enumerate(("primary","hover","pressed","focus","secondary","disabled","tab","selected")):
        x=12+i%4*155;y=62+i//4*72
        ui.button(x,y,149,42,("Начать ночь","Start Night"),style)
        ui.text(x+5,y+44,style,11,"muted")
    from kit import ICONS
    for i,name in enumerate(ICONS):
        x=17+(i%8)*77;y=220+(i//8)*42
        ui.icon(name,x,y);ui.text(x,y+19,name,10,"muted")
    for i,kind in enumerate(("health","shield","enemy","armor")):
        y=370+(i//2)*29;x=20+i%2*306
        ui.text(x,y,kind,12);ui.meter(x+60,y,208,10,73,100,kind)
    ui.im.save(ROOT/"sprites"/"components.png")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--quick",action="store_true",help="only RU normal")
    parser.add_argument("--parts",nargs="+",choices=("front","journal","world","navigation"))
    args=parser.parse_args()
    mods=[front,journal,world]
    if not args.parts or "navigation" in args.parts:
        import navigation
        mods.insert(1,navigation)
    if args.parts:mods=[m for m in mods if m.__name__ in args.parts]
    export()
    variants=VARIANTS[:1] if args.quick else VARIANTS
    screens={slug:label for mod in mods for slug,label in mod.SCREENS.items()}
    errors=[];count=0
    for variant in variants:
        lang,size=variant.split("-")
        for device,(w,h,k) in DEVICES.items():
            for mod in mods:
                for slug in mod.SCREENS:
                    ui=UI(w,h,lang,size=="large")
                    mod.draw(ui,slug)
                    if ui.warnings:errors.append((variant,device,slug,ui.warnings))
                    path=capture(slug,device,variant);path.parent.mkdir(parents=True,exist_ok=True)
                    im=ui.im.convert("RGB");resize(im,(w*k,h*k)).save(path)
                    count+=1
    if not args.parts and not args.quick:
        (ROOT/"source"/"screens.json").write_text(json.dumps(screens,ensure_ascii=False,indent=2),encoding="utf-8")
        frames={}
        for path in sorted((ROOT/"sprites").glob("*/*.png")):
            with Image.open(path) as asset:
                name=path.relative_to(ROOT).as_posix()
                frames[name]={"sourceRect":[0,0,asset.width,asset.height],"mode":asset.mode}
        (ROOT/"sprites"/"frames.json").write_text(json.dumps(frames,indent=2),encoding="utf8")
        comparisons(screens);components()
        from gallery import build
        build(screens)
    print(json.dumps({"screens":len(screens),"png":count,"warnings":errors},ensure_ascii=False,indent=2))
    if errors:raise SystemExit(1)

if __name__=="__main__":main()

