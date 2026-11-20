"""Native art, 9-slice/tile coordinates and the separate transparent sprite exports."""
from functools import lru_cache
from pathlib import Path
import json
import random
from PIL import Image, ImageDraw, ImageEnhance, ImageOps
from lettering import ROOT

MASTERS = ROOT / "masters"
INK="#09182a"
NAVY="#152e4d"
DEEP="#0d2136"
COPPER="#ed965e"
GOLD="#ffc671"
IVORY="#ffe3ad"
PAPER="#e0c79e"
MILK="#edf0df"
MUTED="#a8bec7"
STEEL="#55748b"
TEAL="#8bd6cd"
RED="#ec8d76"
TINT="#82949b"
PARCH_INK="#352b29"
PARCH_SUB="#654633"
SPRITES={}
SLICES={}
ANCHORS={}

def art(name, im, slices=None, anchor=None):
    SPRITES[name]=im.convert("RGBA")
    if slices: SLICES[name]=slices
    if anchor: ANCHORS[name]=anchor
    return im

def chamfer(d, box, cut, fill):
    x,y,rx,by=box
    if cut<=0: d.rectangle(box,fill=fill); return
    d.polygon([(x+cut,y),(rx-cut,y),(rx,y+cut),(rx,by-cut),(rx-cut,by),(x+cut,by),(x,by-cut),(x,y+cut)],fill)

def surface(name, top, foot, face, stone, corners=4, double=False):
    w,h=55,37
    im=Image.new("RGBA",(w,h)); d=ImageDraw.Draw(im)
    chamfer(d,(1,2,w-2,h-1),corners,"#060f20")
    chamfer(d,(0,0,w-2,h-3),corners,"#061321")
    chamfer(d,(1,1,w-3,h-4),corners-1,foot)
    chamfer(d,(1,1,w-3,h-6),corners-1,top)
    raised=name.startswith("button-primary-") and not name.endswith(("pressed","disabled"))
    chamfer(d,(3,4 if raised else 3,w-5,h-6),max(1,corners-2),face)
    # Flat reading area, sparsely exposed clusters, never stipple over lettering.
    rng=random.Random(146)
    for i in range(26):
        x,y=rng.randrange(5,50),rng.randrange(5,29)
        rw,rh=rng.choice([2,3,4,6,8]),rng.choice([1,1,2])
        if name.startswith(("button-","tab-")):
            # Blue slate breaks in little staggered facets, as on the Play plaque.
            end=min(50,x+rw)
            d.polygon([(x+1,y),(end,y),(end,y+1),(max(x+1,end-2),y+rh+1),(x,y+rh),(x,y+1)],fill=stone)
            if i%5==0:d.line((x+1,y,min(end,x+3),y),fill=face)
        else:
            d.line((x,y,min(50,x+rw),y),fill=stone,width=rh)
            if i%3==0:d.point((x+1,y-1),fill=stone)
    if raised:d.line((7,h-5,w-9,h-5),fill="#d6804c")
    if double:
        d.line((8,4,w-9,4),fill=stone)
        d.line((8,h-7,w-9,h-7),fill=stone)
        for x in [6,w-8]:
            for y in [6,h-10]:
                d.rectangle((x-1,y,x+1,y+1),fill=foot); d.point((x,y),fill=top)
    return art(name,im,(12,10,13,11))

def texture_frame():
    for theme,n in [("button","primary"),("button","quiet"),("button","danger"),("tab","tab")]:
        for state in ("idle","hover","pressed","focus","disabled","selected"):
            if n=="primary" or state=="selected": top,foot,face,chip="#f6b174","#985533","#19395d","#214467"
            elif n=="danger": top,foot,face,chip="#cd836a","#693d36","#302b39","#3a303e"
            elif n=="tab": top,foot,face,chip="#576f80","#24394d","#132a44","#16314e"
            else: top,foot,face,chip="#83939a","#405566","#172f49","#1d374f"
            if state=="hover": top,chip="#ffd596","#295075"
            elif state=="pressed": top,face,chip=foot,"#0c233e","#122c48"
            elif state=="focus": top="#ffdf98"
            elif state=="disabled": top,foot,face,chip="#526475","#344655","#17283a","#192d40"
            prefix=f"{theme}-{n}" if theme!="tab" else "tab"
            sp=surface(f"{prefix}-{state}",top,foot,face,chip,6 if theme=="button" else 4)
            if state=="focus":
                d=ImageDraw.Draw(sp)
                for x in [6,sp.width-8]:
                    for y in [5,sp.height-8]:
                        d.rectangle((x-1,y,x+1,y+1),fill=IVORY)
                SPRITES[f"{prefix}-{state}"]=sp
    surface("panel-stone","#b48a61","#5f4b42","#10263e","#132942",5,True)
    surface("panel-inset","#405d70","#263c50","#0c2034","#0d2238",3)
    surface("panel-slate","#5e798b","#334a5d","#112a45","#142e49",4,True)
    surface("panel-picture","#d59d6d","#58453c","#193149","#233c52",4)
    surface("panel-leaf","#ead3aa","#8b694a","#d9c29b","#d7bf96",2,True)
    surface("panel-page-row","#bc9e78","#997d60","#d6ba91","#d5b990",2)
    surface("panel-page-selected","#ad6843","#8c5639","#efcca0","#edc99c",3)
    surface("panel-hud","#62788b","#2f4256","#0b1e33","#0d243a",4)
    surface("panel-signal","#da7f65","#744638","#28283b","#312d3d",5)
    surface("panel-cover","#927457","#4c4037","#132f4c","#193754",5,True)

@lru_cache(maxsize=650)
def sliced(name,size):
    w,h=size; src=SPRITES[name]; sw,sh=src.size
    l,t,r,b=SLICES[name]
    if w<l+r or h<t+b: raise ValueError(f"small 9-slice {name} {size}")
    out=Image.new("RGBA",size)
    sx=[0,l,sw-r,sw]; sy=[0,t,sh-b,sh]
    dx=[0,l,w-r,w]; dy=[0,t,h-b,h]
    for j in range(3):
        for i in range(3):
            tile=src.crop((sx[i],sy[j],sx[i+1],sy[j+1]))
            xx,yy=dx[i],dy[j]
            while yy<dy[j+1]:
                xx=dx[i]
                while xx<dx[i+1]:
                    cw=min(dx[i+1]-xx,tile.width); ch=min(dy[j+1]-yy,tile.height)
                    out.paste(tile if (cw,ch)==tile.size else tile.crop((0,0,cw,ch)),(xx,yy))
                    xx+=tile.width
                yy+=tile.height
    return out

def icon_graphics():
    def icon(name, paint):
        im=Image.new("RGBA",(20,20))
        d=ImageDraw.Draw(im)
        paint(d)
        # A one-pixel dark outline unifies the language across sea, leaf and stone.
        from PIL import ImageFilter,ImageChops
        alpha=im.getchannel("A")
        edge=alpha.filter(ImageFilter.MaxFilter(3))
        out=Image.new("RGBA",im.size,INK); out.putalpha(edge); out.alpha_composite(im)
        art("icon-"+name,out,anchor=(10,10))
    def shard(d):
        d.polygon([(10,1),(17,8),(14,14),(8,18),(3,12),(5,5)],"#457e9d")
        d.polygon([(10,1),(9,10),(4,12),(5,5)],"#a9ece0")
        d.polygon([(10,1),(16,8),(9,10)],"#d1fbeb");d.polygon([(9,10),(16,8),(13,14),(8,17)],"#56b3bf")
        d.line((10,2,8,8),fill="#eff9dc")
    def pearl(d):
        d.ellipse((3,3,16,16),fill="#717c98");d.ellipse((4,3,15,14),fill="#c5d9d7")
        d.ellipse((6,5,10,8),fill="#fff2cf");d.arc((4,4,16,16),65,135,fill="#b69e9c",width=2)
    def lamp(d):
        d.polygon([(6,17),(7,9),(13,9),(15,17)],"#8a9696");d.rectangle((7,5,13,9),fill=GOLD)
        d.polygon([(5,5),(9,1),(11,1),(15,5)],"#bc8a59");d.line((5,10,15,10),fill=COPPER);d.line((5,17,16,17),fill=IVORY)
        d.line((8,6,8,8),fill="#704c38");d.line((12,6,12,8),fill="#704c38")
    def lock(d):
        d.arc((5,2,14,12),175,365,fill=MUTED,width=2);d.rectangle((4,8,15,16),fill="#99a7a7")
        d.line((5,9,14,9),fill="#d4dbce");d.rectangle((9,11,10,14),fill=INK)
    def check(d): d.line([(3,10),(8,15),(17,4)],fill=TEAL,width=3)
    def arrows(d,rev=False):
        pts=[(12,3),(5,10),(12,17)];d.line(pts if not rev else [(19-x,y) for x,y in pts],fill=IVORY,width=2)
    def book(d):
        d.polygon([(2,3),(8,4),(10,6),(13,4),(17,4),(17,15),(12,15),(10,17),(7,15),(2,14)],"#d7b87f")
        d.line((9,6,9,15),fill="#77604b");d.line((4,6,7,7),fill="#fff0c6");d.line((12,8,16,7),fill="#8f7856")
    def lens(d):
        d.ellipse((2,2,15,15),fill="#a37550");d.ellipse((4,4,13,13),fill="#5189ac")
        d.line((5,8,9,5),fill="#c1ebde",width=2);d.line((13,13,17,17),fill=COPPER,width=3)
    def flash(d):
        d.polygon([(11,1),(3,11),(8,11),(6,18),(17,7),(11,7),(14,1)],GOLD);d.line((6,9,11,3),fill=IVORY)
    def speaker(d):
        d.polygon([(2,8),(6,8),(11,3),(11,17),(6,12),(2,12)],"#afcad0")
        d.arc((6,4,16,16),290,75,fill=COPPER,width=2)
    def gear(d):
        for x,y in [(8,2),(8,15),(2,8),(15,8),(4,4),(13,4),(4,13),(13,13)]:
            d.rectangle((x,y,x+2,y+2),fill=COPPER)
        d.ellipse((4,4,15,15),fill="#c7986f");d.ellipse((7,7,12,12),fill=INK)
    def lampgear(d):
        d.line((4,15,13,6),fill="#b1c7c7",width=3);d.arc((10,2,17,9),300,225,fill="#d7e6d9",width=2)
    def marker(d):
        d.line((4,15,4,2),fill=PAPER,width=2);d.polygon([(5,2),(16,3),(12,6),(15,8),(5,8)],fill=COPPER)
        d.line((2,17,10,17),fill=STEEL)
    def aim(d):
        d.ellipse((4,4,15,15),outline=IVORY)
        for line in [(9,1,9,6),(9,13,9,18),(1,9,6,9),(13,9,18,9)]:d.line(line,fill=COPPER,width=2)
    def tree(d):
        for line in [(9,15,9,8),(5,9,15,9),(5,9,5,5),(15,9,15,5)]:d.line(line,fill="#a18057",width=2)
        for x,y in [(9,15),(5,4),(15,4),(10,2)]:d.polygon([(x,y-2),(x+2,y),(x,y+2),(x-2,y)],IVORY)
    def chest(d):
        d.polygon([(2,8),(4,4),(15,4),(17,8),(17,16),(2,16)],"#734d37")
        d.line((3,8,16,8),fill=IVORY);d.line((5,5,5,15),fill=COPPER);d.line((14,5,14,15),fill=COPPER)
        d.rectangle((8,9,11,12),fill=GOLD)
    def moon(d):
        d.ellipse((3,2,16,16),fill="#dedbc6");d.ellipse((8,1,17,12),fill=(0,0,0,0))
    def waves(d):
        for y in [7,12]:
            d.line([(2,y+1),(5,y-1),(8,y+1),(11,y-1),(14,y+1),(17,y)],fill="#9dd0d1",width=2)
    def shield(d):
        d.polygon([(3,4),(10,2),(16,4),(15,11),(10,17),(5,12)],fill="#83b9ca")
        d.polygon([(10,4),(14,5),(13,11),(10,14)],fill="#415d86")
    def warning(d):
        d.polygon([(10,2),(18,16),(2,16)],fill=RED);d.line((10,6,10,11),fill=INK,width=2);d.point((10,14),fill=INK)
    def skull(d):
        d.ellipse((3,3,16,16),fill=PAPER);d.rectangle((6,13,14,16),fill=PAPER)
        d.rectangle((5,8,8,11),fill=INK);d.rectangle((11,8,14,11),fill=INK);d.point((10,13),fill=INK)
    def pause(d):
        d.rectangle((4,4,7,16),fill=IVORY);d.rectangle((12,4,15,16),fill=IVORY)
    def resume(d): d.polygon([(5,3),(16,10),(5,16)],fill=IVORY)
    def close(d):
        d.line((4,4,15,15),fill=MUTED,width=2);d.line((15,4,4,15),fill=MUTED,width=2)
    def reset(d):
        d.arc((4,4,16,16),200,515,fill=IVORY,width=2);d.polygon([(2,3),(2,10),(8,8)],COPPER)
    def pin(d):
        d.ellipse((4,2,15,13),fill=COPPER);d.polygon([(5,10),(9,18),(14,10)],COPPER);d.ellipse((7,5,12,10),fill=INK)
    def swap(d):
        d.line((2,6,15,6),fill=TEAL,width=2);d.polygon([(12,2),(18,6),(12,10)],TEAL)
        d.line((4,14,17,14),fill=IVORY,width=2);d.polygon([(7,10),(1,14),(7,18)],IVORY)
    def rank(d):
        d.polygon([(3,13),(10,5),(17,13),(10,10)],fill=COPPER);d.line([(4,15),(10,11),(16,15)],fill=IVORY,width=2)
    def sand(d):
        d.line((4,3,15,3),fill=IVORY,width=2);d.line((4,16,15,16),fill=IVORY,width=2)
        d.line([(5,4),(6,7),(13,12),(14,15)],fill=MUTED);d.line([(14,4),(13,7),(6,12),(5,15)],fill=MUTED)
        d.polygon([(6,5),(13,5),(10,8)],GOLD);d.polygon([(7,14),(10,12),(13,14)],GOLD)
    def gearcase(d):
        d.rectangle((3,7,16,16),fill="#827c72");d.rectangle((6,4,13,9),outline=IVORY,width=2)
        d.line((3,10,16,10),fill=COPPER);d.line((9,9,9,12),fill=GOLD,width=2)
    def chart(d):
        d.polygon([(2,4),(7,2),(12,4),(17,2),(17,15),(12,17),(7,15),(2,17)],PAPER)
        d.line((7,3,7,14),fill="#9b805f");d.line((12,5,12,15),fill="#9b805f")
        d.line([(4,12),(7,9),(10,10),(14,6)],fill=INK)
    def lantern(d):
        d.arc((6,1,14,9),180,360,fill=COPPER);d.polygon([(4,6),(15,6),(13,16),(6,16)],"#ad8c64")
        d.rectangle((7,8,12,13),fill=GOLD);d.line((8,7,8,13),fill=IVORY);d.line((5,17,14,17),fill=COPPER)
    def compass(d):
        d.ellipse((2,2,17,17),outline="#b89e7b",width=1)
        d.polygon([(13,4),(11,11),(6,15),(8,8)],"#a2c6cb");d.polygon([(13,4),(11,11),(9,9)],COPPER)
    def seal(d):
        d.ellipse((3,3,16,16),outline=TEAL,width=2)
        d.polygon([(10,5),(14,12),(6,12)],outline=IVORY)
    def plus(d):
        d.line((4,9,16,9),fill=IVORY,width=2);d.line((10,3,10,16),fill=IVORY,width=2)
    def minus(d): d.line((4,9,16,9),fill=IVORY,width=2)
    def sun(d):
        d.ellipse((5,5,14,14),fill=GOLD)
        for a in [(9,1,9,3),(9,16,9,18),(1,9,3,9),(16,9,18,9),(3,3,5,5),(15,15,17,17),(15,4,17,2),(2,17,4,15)]:d.line(a,fill=IVORY)
    for name,fn in (("shard",shard),("pearl",pearl),("beacon",lamp),("lock",lock),("check",check),("back",arrows),
                    ("next",lambda d:arrows(d,True)),("book",book),("lens",lens),("flash",flash),("sound",speaker),
                    ("settings",gear),("repair",lampgear),("flag",marker),("target",aim),("tree",tree),("collection",chest),
                    ("moon",moon),("waves",waves),("shield",shield),("warning",warning),("skull",skull),("pause",pause),
                    ("play",resume),("close",close),("retry",reset),("pin",pin),("move",swap),("rank",rank),("clock",sand),
                    ("devices",gearcase),("map",chart),("journal",lantern),("recon",compass),("seal",seal),
                    ("plus",plus),("minus",minus),("sun",sun)):
        icon(name,fn)
    for key,colors in {"health":("#77b8a0","#b0dfb5"),"armor":("#7ea4bd","#b8d9df"),"shield":("#7ba2d1","#b7cbee"),
                       "boss":("#bc695b","#ea9680"),"charge":("#cf985a",IVORY),"inactive":("#4b6072","#687d89")}.items():
        sp=Image.new("RGBA",(30,7));d=ImageDraw.Draw(sp);chamfer(d,(0,0,29,6),2,INK)
        d.rectangle((2,2,27,4),fill=colors[0]);d.line((2,2,27,2),fill=colors[1]);art("meter-"+key,sp,(3,2,3,2))
    for name in ("target-lit","target-active","target-invalid"):
        c={"target-lit":GOLD,"target-active":TEAL,"target-invalid":RED}[name]
        sp=Image.new("RGBA",(32,24));d=ImageDraw.Draw(sp)
        for x,y,sx,sy in [(1,2,1,1),(30,2,-1,1),(1,21,1,-1),(30,21,-1,-1)]:
            d.line([(x+sx*4,y),(x,y),(x,y+sy*3)],fill=INK,width=3)
            d.line([(x+sx*4,y),(x,y),(x,y+sy*3)],fill=c)
        art(name,sp,(7,6,7,6),anchor=(16,12))
    for name,colors in [("foe-health",("#8cbaa8","#4b4b4b")),("foe-lit-health",("#d5deb0","#4b4b4b")),
                        ("foe-armor",("#98b8d0","#394e65")),("part-durability",("#a5c7d1","#384e62"))]:
        sp=Image.new("RGBA",(24,6));d=ImageDraw.Draw(sp)
        if name in ("foe-health","foe-lit-health"):
            d.rectangle((0,1,23,4),fill=INK);d.line((1,0,22,0),fill=INK);d.line((1,5,22,5),fill=INK)
            d.rectangle((1,1,22,3),fill=colors[1]);d.rectangle((1,1,14,3),fill=colors[0])
        else:
            for j in range(5):d.rectangle((j*5,2,j*5+2,4),fill=colors[0] if j<3 else colors[1])
        art(name,sp,anchor=(12,5))
    for key,clr,inner in [("track","#334d62","#0a1d31"),("fill","#d79059","#f6c988")]:
        sp=Image.new("RGBA",(20,7));d=ImageDraw.Draw(sp);chamfer(d,(0,0,19,6),2,clr);d.line((3,3,16,3),fill=inner)
        art("slider-"+key,sp,(4,2,4,2))
    sp=Image.new("RGBA",(13,15));d=ImageDraw.Draw(sp);chamfer(d,(0,1,12,14),3,"#473b39")
    chamfer(d,(1,0,11,12),3,COPPER);chamfer(d,(3,2,9,10),2,GOLD);d.line((4,3,8,3),fill=IVORY)
    art("slider-thumb",sp,anchor=(6,7))
    for name,color in [("marked",GOLD),("open",STEEL),("complete",TEAL),("locked","#617382")]:
        sp=Image.new("RGBA",(18,18));d=ImageDraw.Draw(sp);d.polygon([(9,0),(17,9),(9,17),(0,9)],fill=INK)
        d.polygon([(9,2),(15,9),(9,15),(2,9)],fill=color);d.polygon([(9,4),(13,9),(9,13),(4,9)],fill=NAVY)
        if name in ("complete","marked"): d.polygon([(9,6),(12,9),(9,12),(6,9)],fill=color)
        else: d.point((9,9),fill=color)
        art("node-"+name,sp,anchor=(9,9))

PLATES=[]
TILES={}
WORLD_NAMES=("beacon","cannon","light-trap","tentacle","ghost","turtle","minotaur","bat")
def from_masters():
    raw=Image.open(MASTERS/"journal-plates.png").convert("RGB")
    cw,ch=raw.width//2,raw.height//4
    for row in range(4):
        for col in range(2):
            box=(col*cw+2,row*ch+2,(col+1)*cw-2,(row+1)*ch-2)
            im=raw.crop(box).resize((308,230),Image.Resampling.BOX)
            PLATES.append(im.quantize(colors=80,dither=Image.Dither.NONE).convert("RGB"))
    raw=Image.open(MASTERS/"coastal-materials.png").convert("RGB")
    side=raw.width//2
    for i,(name,size) in enumerate([("heath",182),("sea",162),("cliff",96),("paving",75)]):
        x=i%2*side;y=i//2*side
        tile=raw.crop((x+2,y+2,x+side-2,y+side-2)).resize((size,size),Image.Resampling.BOX)
        TILES[name]=tile.quantize(colors=32,dither=Image.Dither.NONE).convert("RGB")
    raw=Image.open(MASTERS/"watch-sprites.png").convert("RGBA")
    boxes=[(75,10,315,505),(390,170,751,467),(815,244,1110,470),(1215,75,1500,480),
           (6,606,366,952),(373,617,752,925),(775,580,1146,953),(1150,606,1534,895)]
    targets=[(40,74),(30,22),(22,16),(34,49),(28,27),(32,25),(33,31),(30,20)]
    for name,box,size in zip(WORLD_NAMES,boxes,targets):
        orig=raw.crop(box); mask=orig.getchannel("A").point(lambda n: 255 if n>=112 else 0)
        bounds=mask.getbbox(); orig=orig.crop(bounds)
        # Lanczos integrates oversized sprite masters; every exported edge is then
        # snapped to one logical pixel. Colour is limited independently of the alpha.
        final=ImageOps.contain(orig,size,Image.Resampling.LANCZOS);alpha=final.getchannel("A").point(lambda n:255 if n>=115 else 0)
        sp=final.convert("RGB").quantize(colors=44,dither=Image.Dither.NONE).convert("RGBA");sp.putalpha(alpha)
        p=Image.new("RGBA",(sp.width+2,sp.height+2));p.alpha_composite(sp,(1,1))
        art("world-"+name,p,anchor=(p.width//2,p.height-2))
        if name in ("beacon","cannon","light-trap","tentacle","turtle"):
            # Inventory engravings are independent, larger crops of the master.
            cameo=ImageOps.contain(orig,(96,86),Image.Resampling.LANCZOS)
            a=cameo.getchannel("A").point(lambda n:255 if n>=115 else 0)
            cameo=cameo.convert("RGB").quantize(colors=48,dither=Image.Dither.NONE).convert("RGBA");cameo.putalpha(a)
            art("object-"+name,cameo,anchor=(cameo.width//2,cameo.height-1))

def prepare():
    texture_frame();icon_graphics();from_masters()

def exports(out):
    sd=out/"sprites";pd=out/"plates";sd.mkdir(exist_ok=True,parents=True);pd.mkdir(exist_ok=True,parents=True)
    # Fixed gutters and native frame coordinates, exclusive right/bottom convention.
    x=y=2; rowh=0; atlas_width=512; frames={}
    for name,sp in SPRITES.items():
        if x+sp.width+2>atlas_width:
            x=2;y+=rowh+3;rowh=0
        frames[name]={"file":f"{name}.png","rect":[x,y,sp.width,sp.height]}
        if name in SLICES:frames[name]["nineSlice"]=SLICES[name]
        if name in ANCHORS:frames[name]["anchor"]=ANCHORS[name]
        x+=sp.width+3;rowh=max(sp.height,rowh)
        sp.save(sd/f"{name}.png",compress_level=5)
    atlas=Image.new("RGBA",(atlas_width,y+rowh+2))
    for key,item in frames.items():atlas.paste(SPRITES[key],tuple(item["rect"][:2]))
    atlas.save(sd/"atlas.png",compress_level=6)
    (sd/"atlas.json").write_text(json.dumps({"size":atlas.size,"format":"RGBA","nineSliceOrder":"left, top, right, bottom; repeat edges and centre","frames":frames},indent=2)+"\n",encoding="utf-8")
    for i,im in enumerate(PLATES):
        im.save(pd/("epilogue.png" if i==7 else f"chapter-{i+1:02d}.png"))
    for key,tile in TILES.items():tile.save(pd/f"terrain-{key}.png")
