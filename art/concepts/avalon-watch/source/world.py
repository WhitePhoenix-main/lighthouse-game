"""Pixel plates and responsive concept scenes for the first headland.

All coordinates in the painter belong to the concept, not to the simulation.
Pillow is the only dependency. Run this module directly to export its sprites.
"""
import math
import random
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


OUT = Path(__file__).resolve().parents[1] / "sprites" / "world"
SCREENS = {
    "preparation": "Подготовка",
    "prep-catalog": "Устройства и обслуживание",
    "prep-lens": "Выбор линзы",
    "prep-ability": "Выбор способности",
    "prep-recon": "Разведка ночи",
    "prep-currency": "Пополнение осколков",
    "placement-invalid": "Недопустимая позиция",
    "placement-move": "Перенос экземпляра",
    "battle": "Бой",
    "battle-boss": "Бой со Стражем глубин",
    "battle-device": "Команды пушки",
    "pause": "Пауза",
    "abandon": "Прерывание ночи",
}
W, H = 1000, 900
BEACON = (497, 447)
NEAR = Image.Resampling.NEAREST
INK = "#101a2b"


def between(a, b, t):
    return tuple(round(x + (y-x)*max(0, min(1, t))) for x, y in zip(a, b))


def pixels(w,h):
    im = Image.new("RGBA", (w,h))
    return im, ImageDraw.Draw(im)


def stamp(im, tile, x, y):
    im.alpha_composite(tile, (round(x), round(y)))


def lantern_tower():
    im,d=pixels(80,124)
    rng=random.Random(34)
    # Three courses of polygonal footing. Lip light comes from upper left.
    for i,c in enumerate(["#121c28","#313b45","#646656"]):
        x,y=4+i*2,111-i*2
        d.polygon([(x,y),(21,102-i),(54,101-i),(76-i*2,110-i),(72-i*2,119-i*2),(51,123-i*2),(20,121-i*2),(x,116-i)], fill=c)
    d.polygon([(11,105),(18,98),(59,96),(69,105),(68,112),(50,117),(26,116),(11,111)],fill="#26313a")
    d.line([(12,105),(28,111),(51,112),(68,106)],fill="#83816b",width=2)
    # Cylindrical tower with individually staggered masonry and shadowed mortar.
    d.polygon([(26,38),(55,38),(62,103),(55,109),(29,111),(18,104)], fill="#17212d")
    for y in range(40,107):
        left=round(26-(y-40)*.12); right=round(54+(y-40)*.115)
        pos=left
        for span,c in [(0.12,"#88836c"),(.24,"#777666"),(.32,"#66695d"),(.53,"#575f59"),(.72,"#465257"),(.9,"#323f4b"),(1,"#263444")]:
            end=round(left+(right-left)*span)
            d.line((pos,y,end,y), fill=c); pos=end+1
    for row,y in enumerate(range(42,106,5)):
        left=round(26-(y-40)*.12); right=round(54+(y-40)*.115)
        for x in range(left+row%2*4,right,8):
            xx=min(x+6,right-1); yy=y+(1 if x>left+7 and x<right-7 else 0)
            if xx<=x:continue
            d.line((x,yy,xx,yy),fill=rng.choice(["#303e45","#465052","#4d5552"]))
            d.line((x,yy-3,x,yy-1),fill="#445052")
            if rng.random()<.65:d.line((x+1,yy+1,min(xx,x+4),yy+1),fill=rng.choice(["#8c8971","#72786b"]))
    for y,x,sw in [(55,45,4),(70,30,4),(82,48,3)]:
        d.rectangle((x-1,y,x+sw,y+8),fill="#25303b")
        d.rectangle((x,y+1,x+sw-2,y+6),fill="#bc7134");d.line((x,y+2,x,y+5),fill="#ffca67")
        d.line((x-2,y+8,x+sw+1,y+8),fill="#878575")
    d.polygon([(30,108),(30,96),(33,90),(39,88),(43,91),(46,96),(46,110)],fill="#92917c")
    d.polygon([(32,108),(32,96),(35,92),(40,92),(44,97),(44,110)],fill="#18242c")
    d.polygon([(34,108),(34,96),(37,94),(40,95),(41,98),(41,109)],fill="#934f32")
    for x in (35,37,39):d.line((x,98,x,108), fill="#d28f4a")
    d.point((40,102),fill="#ffe28b")
    for y in [42,45,49]:
        d.polygon([(24,y),(37,y+2),(53,y+1),(57,y-1),(56,y+2),(40,y+5),(24,y+3)],fill="#343e42")
        d.line([(24,y),(37,y+2),(53,y+1),(56,y-1)], fill="#83856c")
    # Cantilever gallery, wrought rails, warm six-pane Fresnel lantern.
    d.polygon([(18,33),(58,30),(64,34),(62,40),(46,44),(27,42),(18,39)],fill="#27323d")
    d.line([(18,37),(31,40),(47,41),(62,37)],fill="#b79a65")
    d.polygon([(26,22),(34,19),(49,20),(56,22),(55,34),(44,38),(26,34)],fill="#9c5938")
    for x,dy,c in [(28,0,"#df9143"),(34,1,"#ffcf70"),(41,1,"#ffe5a2"),(48,0,"#eca14a")]:
        d.rectangle((x,22+dy,x+4,32+dy),fill=c);d.line((x+1,24+dy,x+1,29+dy),fill="#fff1b2")
    for x in [26,32,40,47,54]: d.line((x,21,x,34),fill="#473a35",width=2)
    d.line([(26,28),(40,30),(55,28)],fill="#a36b3c")
    for x in [19,25,33,43,53,61]:d.line((x,32+(x in (33,43)),x,38+(x in (33,43))*2),fill="#333e42")
    d.line([(18,32),(33,35),(45,35),(62,31)],fill="#b09769")
    d.polygon([(19,21),(23,17),(31,13),(38,8),(42,7),(46,13),(55,16),(60,21),(45,24),(30,23)],fill="#1e2c37")
    d.polygon([(21,20),(32,15),(39,10),(34,20),(28,22)],fill="#636850")
    d.polygon([(35,20),(40,9),(43,11),(45,20)],fill="#414c49")
    d.line([(21,21),(35,23),(44,23),(59,20)],fill="#c1a46b")
    d.line((41,1,41,10),fill="#d4b879");d.line((38,5,45,5),fill="#797e71")
    return im


def cannon():
    im,d=pixels(36,30)
    d.polygon([(1,23),(7,18),(25,17),(34,22),(32,27),(19,29),(5,27)],fill=INK)
    d.polygon([(3,23),(11,19),(24,19),(32,22),(22,26),(10,26)],fill="#68736a")
    d.polygon([(7,21),(11,13),(19,12),(25,21),(19,25)], fill="#855c40",outline="#292c36")
    for x,y in [(11,22),(23,20)]:
        d.ellipse((x-5,y-6,x+4,y+4),fill="#182532",outline="#16232e")
        d.ellipse((x-4,y-5,x+3,y+3),fill="#8b6747",outline="#bd935c")
        d.line((x,y-4,x,y+2),fill="#493c36");d.line((x-3,y,x+2,y-2),fill="#503f35")
        d.point((x,y-1), fill="#dac288")
    d.polygon([(5,7),(7,4),(11,4),(25,13),(26,18),(22,20),(7,12)],fill="#25313c",outline="#111d2a")
    d.polygon([(8,6),(10,5),(24,14),(22,15)],fill="#9caa9a")
    d.line((8,10,22,18),fill="#53666b",width=2)
    d.line((14,8,11,13),fill="#b59860",width=2);d.line((24,13,20,18),fill="#a89b75",width=2)
    d.polygon([(4,7),(6,3),(10,3),(12,6),(9,12),(5,12)],fill="#697675",outline="#293642")
    d.line([(6,9),(6,7),(8,5),(9,6)],fill="#1d2834",width=2)
    return im


def barricade():
    im,d=pixels(39,26)
    for x,y in [(3,14),(10,12),(17,9),(24,7),(30,5)]:
        d.polygon([(x,y+2),(x+1,y-3),(x+3,y-5),(x+5,y-1),(x+6,y+7),(x+2,y+10)],fill="#715840",outline="#263133")
        d.line((x+2,y-2,x+3,y+6),fill="#b59969")
    d.line([(3,20),(34,8)],fill="#3a3935",width=4);d.line([(3,18),(34,6)],fill="#9b8c67")
    for x,y in [(9,16),(26,10)]:d.rectangle((x,y-1,x+2,y+2),fill="#8c9690")
    return im


def ghost():
    im,d=pixels(32,34)
    d.polygon([(2,29),(7,25),(6,20),(2,22),(5,15),(10,12),(11,7),(15,3),(21,2),(26,6),(26,12),(23,16),(26,19),(29,18),(28,22),(24,24),(22,22),(21,26),(16,30),(9,32),(12,28),(6,30)],fill="#1c3448",outline="#142c3c")
    d.polygon([(5,27),(10,23),(10,17),(6,19),(10,14),(13,13),(12,9),(16,5),(22,4),(25,8),(23,13),(20,15),(21,20),(18,25),(13,29),(15,25),(9,28)],fill="#67ac9e")
    d.polygon([(8,23),(12,17),(14,11),(15,7),(20,5),(23,7),(19,8),(17,13),(17,18),(14,22),(12,25)],fill="#a7d8bb")
    d.polygon([(17,12),(18,9),(23,8),(24,11),(21,15),(17,16)],fill="#244856")
    d.rectangle((19,11,20,12),fill="#f6e6a4");d.point((23,10),fill="#fff4ba")
    d.line([(19,18),(23,20),(26,20),(28,18)],fill="#9fcfb0",width=2)
    d.line([(8,29),(5,31),(2,31)],fill="#78a89f");d.point((4,25),fill="#c8dbba")
    return im


def turtle():
    im,d=pixels(48,33)
    for x,y in [(10,24),(25,25),(30,21),(13,18)]:
        d.polygon([(x,y-3),(x+5,y-3),(x+8,y+2),(x+6,y+5),(x+1,y+5),(x+2,y+2)],fill="#446466",outline=INK)
        d.line((x+4,y+3,x+8,y+2),fill="#aea580")
    d.polygon([(2,19),(6,17),(10,16),(10,24),(6,22)],fill="#66847a",outline=INK)
    d.polygon([(7,18),(10,11),(15,6),(23,4),(31,7),(36,13),(36,18),(31,23),(15,25),(8,23)],fill="#30444c",outline=INK)
    for pts,c in [([(9,17),(13,10),(18,10),(19,16),(14,21),(9,21)],"#7d8571"), ([(15,9),(21,5),(25,6),(27,11),(20,15),(18,11)],"#b0a780"), ([(21,16),(27,12),(32,13),(34,16),(30,20),(23,21)],"#737d71")]:
        d.polygon(pts,fill=c);d.line(pts[:3],fill="#c6b693")
    for x,y in [(11,13),(18,8),(28,11)]:
        d.polygon([(x,y+1),(x+1,y-6),(x+4,y-2),(x+5,y+2)], fill="#546579",outline="#354050");d.point((x+1,y-5), fill="#b9b6ac")
    d.polygon([(32,15),(36,14),(38,12),(43,12),(46,15),(46,20),(40,22),(35,20),(33,22)],fill="#6d9081",outline=INK)
    d.line([(35,16),(39,14),(43,14)],fill="#b0be90");d.rectangle((41,15,43,16),fill="#f9b86f");d.point((43,16),fill="#2c2d36");d.line((40,20,45,19),fill="#3a4a4c")
    d.line([(9,22),(16,24),(24,23),(31,21)], fill="#b29c73")
    return im


def bat():
    im,d=pixels(43,28)
    shape=[(2,3),(7,5),(14,11),(19,13),(21,11),(25,12),(31,7),(36,3),(41,2),(37,10),(36,17),(31,16),(27,21),(25,19),(22,25),(19,21),(17,19),(14,22),(10,16),(7,15),(6,12)]
    d.polygon(shape,fill="#654966",outline="#211f36")
    for x,y,ex,ey in [(4,5,15,12),(8,7,13,17),(39,4,26,15),(36,8,30,16)]:
        d.line((x,y,ex,ey), fill="#b08291")
    d.polygon([(16,17),(18,7),(21,11),(25,7),(26,17),(23,21),(20,21)],fill="#413947",outline=INK)
    d.rectangle((19,14,20,15),fill="#ffd483");d.rectangle((24,13,25,14),fill="#ffd483")
    return im


def mechanism(kind):
    im,d=pixels(38,40)
    # Worn bronze feet connect devices to the same stone plinths as the beacon.
    d.polygon([(2,31),(12,25),(27,26),(36,31),(34,36),(23,39),(7,37)],fill="#273740",outline=INK)
    d.polygon([(3,31),(13,26),(26,27),(34,31),(22,35),(8,34)],fill="#74786b")
    d.line([(4,31),(12,34),(22,35),(31,32)],fill="#a6a487")
    gold="#d2aa68";metal="#687c81";wood="#725a45";warm="#ffca77"
    if kind=="harpoon":
        d.polygon([(13,32),(15,16),(21,15),(25,31),(21,34)],fill=wood,outline=INK)
        d.line([(20,32),(18,21),(18,16)],fill=gold,width=2)
        d.line([(3,7),(9,10),(27,22)],fill=INK,width=5)
        d.line([(3,6),(10,10),(26,20)],fill="#a0b6b5",width=2)
        d.polygon([(1,4),(12,6),(8,8),(8,12)],fill="#b2c9bf",outline="#3a535d")
        d.line([(24,8),(25,13),(17,22),(8,24)],fill=wood,width=3)
        d.line([(25,8),(26,11),(9,24)],fill=gold)
    elif kind=="mortar":
        d.polygon([(6,31),(10,22),(25,19),(30,30),(25,34)],fill=wood,outline=INK)
        d.polygon([(5,12),(12,7),(19,7),(28,23),(26,29),(20,31),(13,27)],fill=metal,outline=INK)
        d.ellipse((4,7,20,17),fill=gold,outline=INK);d.ellipse((7,9,17,14),fill=INK)
        d.line([(10,18),(15,23),(19,28)],fill="#a0a894",width=2)
        d.arc((12,16,30,31),35,133,fill=gold,width=2)
    elif kind=="bell":
        d.line((8,32,9,10),fill=wood,width=4);d.line((29,32,28,10),fill=wood,width=4)
        d.polygon([(5,9),(16,3),(22,3),(33,9),(32,13),(6,13)],fill="#33464c",outline=INK)
        d.line([(5,9),(16,4),(22,4),(31,9)],fill=gold)
        d.polygon([(13,25),(15,19),(15,15),(18,12),(21,12),(24,16),(24,20),(28,25),(27,27),(12,27)],fill="#ac8753",outline=INK)
        d.line([(14,24),(17,20),(18,15)],fill="#efc57e",width=2);d.line((13,25,26,25),fill=gold)
        d.rectangle((18,27,21,30),fill="#71543e")
    elif kind=="light-trap":
        for x,y in [(6,28),(15,23),(24,22),(32,29)]:
            d.polygon([(x-2,y+2),(x-3,y-6),(x-1,y-8),(x+2,y-2),(x+2,y+2)],fill="#8ea29a",outline=INK)
        d.polygon([(11,30),(15,24),(23,23),(27,28),(20,32)],fill=gold,outline=INK)
        d.polygon([(14,28),(17,25),(23,25),(20,29)],fill="#fff0a2")
    else:
        d.polygon([(11,31),(13,22),(16,17),(22,17),(24,23),(28,30),(24,33),(14,33)],fill=metal,outline=INK)
        d.polygon([(11,11),(18,6),(24,8),(28,13),(26,22),(19,26),(12,21)],fill="#4e564e",outline=INK)
        d.polygon([(13,13),(17,11),(19,14),(19,22),(14,20)],fill=warm)
        d.polygon([(20,14),(25,11),(24,19),(21,22)],fill="#b9e0d2" if kind=="generator" else "#fbdfaa")
        d.line([(10,12),(18,6),(24,8),(27,11)],fill=gold,width=2)
        d.line((15,26,24,25),fill=gold)
        if kind=="generator":
            for x in (6,30):
                d.line([(x,29),(x,16),(x+1,12)],fill=metal,width=3)
                d.line((x-2,16,x+2,16),fill=gold);d.point((x,11), fill="#c7efe6")
        else:
            d.line((17,16,17,20),fill="#fff7ce");d.line((15,18,18,18),fill="#fff7ce")
    return im


def boulder(seed):
    im,d=pixels(43,27);rng=random.Random(seed)
    d.polygon([(1,20),(6,13),(12,8),(22,5),(32,9),(39,14),(41,20),(30,23),(12,25)],fill="#203435")
    d.polygon([(3,19),(6,12),(14,7),(24,4),(32,7),(38,12),(37,18),(28,22),(12,23)],fill="#405158")
    d.polygon([(4,18),(8,11),(16,8),(24,6),(28,8),(21,10),(15,15),(9,18)],fill="#77817b")
    d.polygon([(13,19),(17,13),(24,10),(33,10),(29,15),(22,17),(18,21)],fill="#59676a")
    d.line([(7,12),(14,8),(24,6)],fill="#879285")
    for _ in range(25):
        x=rng.randint(8,26); y=round(13-(x-8)*.24)+rng.randint(-2,2)
        d.line((x,y,x+rng.randint(1,4),y),fill=rng.choice(["#6b815c","#809268","#59705c"]))
    return im


def warden_part(core):
    im,d=pixels(56,56)
    d.ellipse((2,44,52,53),outline="#6d98a1",width=2)
    d.line([(0,48),(5,47),(9,47)],fill="#c2cabc")
    if core:
        d.polygon([(3,48),(9,39),(11,28),(17,21),(24,17),(32,17),(40,22),(44,29),(43,37),(50,46),(48,49),(35,45),(30,50),(19,47),(9,50)],fill="#253b4b",outline="#142535")
        d.polygon([(11,44),(15,31),(21,24),(30,21),(37,24),(41,30),(39,37),(35,40),(28,39),(22,44),(18,42)],fill="#5c7775")
        for x,y in [(14,32),(20,25),(27,21),(37,25)]:
            d.polygon([(x-2,y+1),(x-4,y-9),(x-1,y-8),(x+5,y-1),(x+3,y+2)],fill="#5e6975",outline="#2d4050");d.line((x-3,y-7,x,y-1),fill="#a8aa98")
        d.polygon([(19,34),(23,29),(31,28),(37,32),(32,38),(25,39)],fill="#2b3844")
        d.polygon([(22,34),(26,31),(31,31),(34,33),(30,36),(25,36)],fill="#f3b876")
        d.rectangle((27,31,29,36),fill="#503d40");d.point((24,33),fill="#fff3be")
    else:
        path=[(19,47,13),(28,43,12),(34,38,10),(35,30,9),(31,24,7),(24,19,6),(21,13,5),(23,8,4),(28,7,3),(31,9,2),(32,12,1)]
        for i,(x,y,r) in enumerate(path):
            d.ellipse((x-r,y-r,x+r,y+r),fill="#263b4b")
            if r>=2:d.ellipse((x-r+2,y-r+1,x+r-1,y+r-2),fill="#4c636a")
            if r>3:
                d.line((x-r+3,y-2,x-r+4,y-r+2),fill="#91a7a0",width=2)
        for x,y,r in [(18,47,3),(24,44,3),(30,40,3),(33,34,3),(32,28,2),(28,24,2),(23,20,2),(21,16,1)]:
            d.ellipse((x-r,y-r,x+r,y+r),fill="#b58f86",outline="#4c4756")
            d.point((x,y),fill="#593e52")
    return im


def pier():
    im,d=pixels(99,58)
    for x,y in [(7,9),(31,20),(61,32),(88,43)]:
        d.polygon([(x,y),(x+5,y),(x+6,y+13),(x+3,y+17),(x,y+15)],fill="#283840")
        d.line((x+1,y+2,x+2,y+13),fill="#715f4e")
    d.polygon([(2,6),(14,1),(95,36),(94,42),(80,47),(2,13)], fill="#393f3d",outline="#21313a")
    for i in range(17):
        x=3+i*4;y=8+round(i*1.75);v=i%3
        d.polygon([(x,y),(x+12,y-5),(x+16,y-3),(x+4,y+2)], fill=["#81735d","#726856","#8b7960"][v])
        d.line((x+1,y,x+11,y-4),fill="#a29171")
    for x,y in [(2,6),(32,18),(69,34),(81,39)]:
        d.rectangle((x,y-7,x+3,y+4),fill="#5f5548");d.line((x,y-6,x,y+3), fill="#a18c6b")
        d.line((x,y-7,x+3,y-7),fill="#c9ab7b")
    return im


@lru_cache(None)
def components():
    return {**{name:mechanism(name) for name in ("harpoon","mortar","bell","light-trap","generator","repair-lamp")},
            "beacon":lantern_tower(),"shore-cannon":cannon(),"palisade":barricade(),
            "warden-core":warden_part(True),"warden-tentacle":warden_part(False),
            "ghost":ghost(),"armored-turtle":turtle(),"bat":bat(),
            "tidal-rock":boulder(51),"landing-pier":pier()}


def shore(y):
    return round(507+22*math.sin((y-380)/72)+13*math.sin((y-400)/37)+8*math.sin(y/19)+4*math.sin(y/8))


def stone(d,x,y,a,b,tone):
    d.polygon([(x-a,y),(x-a+2,y-b+1),(x-1,y-b),(x+a-2,y-b+1),(x+a,y),(x+a-1,y+2),(x+1,y+b),(x-a+1,y+2)],fill="#364441")
    d.polygon([(x-a,y),(x-a+2,y-b+1),(x-1,y-b),(x+a-2,y-b+1),(x+a,y),(x+1,y+b-2),(x-a+2,y+1)],fill=tone)
    d.line((x-a+2,y-b+1,x-2,y-b),fill="#959282")


def meadow_base(rng):
    # Continuous cool variation under the pixel clusters keeps the broad ground legible.
    def noisemap(size):
        f=Image.new("L",size);f.putdata([rng.randrange(256) for _ in range(size[0]*size[1])])
        return f.resize((W,H),Image.Resampling.BICUBIC)
    g=Image.blend(noisemap((16,17)),noisemap((61,57)),.31)
    pal=[between((33,54,56),(91,103,75),i/255) for i in range(256)]
    g.putpalette([v for c in pal for v in c]);return g.convert("RGBA")


def ruined_arch():
    im,d=pixels(87,68)
    def block(x,y,w,h,light):
        d.rectangle((x+2,y,x+w+2,y+h),fill="#263748")
        d.rectangle((x,y+1,x+w-1,y+h-2),fill=light)
        d.line((x+1,y,x+w-2,y), fill="#91937b")
        d.line((x+w-2,y+1,x+w-2,y+h-2),fill="#394c51")
    for n in range(4):
        for col,x in enumerate([14,23,57,66]):
            block(x+(n%2)*2,58-n*7,9,7,["#58665f","#47585a","#58665f","#495959"][col])
    for i in range(11):
        a=math.pi+math.pi*i/11; b=a+math.pi/11-.045
        pts=[(round(44+rx*math.cos(k)),round(38+ry*math.sin(k))) for rx,ry,k in [(29,32,a),(29,32,b),(19,22,b),(19,22,a)]]
        d.polygon(pts,fill=["#67736a","#596665","#747a6b"][i%3],outline="#32444d")
        d.line(pts[:2],fill="#8e927a")
    d.polygon([(17,40),(22,35),(24,31),(26,32),(23,39),(20,42),(21,50),(18,50)],fill="#748254")
    return im


def spruce(d,x,y,h,rng):
    # Broken stippled shelves read as windward coastal junipers.
    d.line((x,y-h*.5,x-2,y),fill="#494d3e",width=3)
    for i in range(8):
        yy=y-h+i*h*.09
        ww=round((.04+.021*i)*h)
        d.polygon([(x+3,yy-5),(x+ww,yy+7),(x+ww-2,yy+8),(x+4,yy+7),(x-ww-4,yy+10),(x-ww,yy+6)],fill="#243f44")
        d.line([(x-ww-2,yy+7),(x-ww//3,yy+3),(x+2,yy+1)],fill="#506a5f")
        if i%2:
            d.line((x-ww+1,yy+6,x-ww//2,yy+5),fill="#71836d")


@lru_cache(None)
def shore_plate():
    rng=random.Random(714097); ground=meadow_base(rng);land=ImageDraw.Draw(ground)
    # Broad patches of sea grass with horizontal clearings between big shapes.
    for _ in range(3260):
        x=rng.randrange(0,550);y=rng.randrange(H)
        colors=["#5b705c","#6e7958","#607259","#415d53","#526b56","#72805c"]
        tone=rng.choice(colors);s=rng.randint(3,9)
        land.polygon([(x-s,y),(x-2,y-3),(x+1,y-2),(x+2*s,y-2),(x+s,y+1),(x+1,y+2)],fill=tone)
        for j in range(rng.randrange(2,5)):
            xx=x+rng.randint(-s,s);yy=y+rng.randint(-2,2);hh=rng.randint(2,5)
            land.line([(xx,yy),(xx+1,yy-hh+1),(xx+2,yy-hh)],fill=rng.choice(colors))
    # Two converging trails contain uneven gravel and worn stone slabs.
    for sign in (-1,1):
        pts=[(x,round(447+sign*.39*(497-x)+13*math.sin(x/59))) for x in range(25,499,4)]
        for thick,tone in [(52,"#47584f"),(42,"#576050"),(31,"#686b59")]:
            land.line(pts,fill=tone,width=thick,joint='curve')
        for _ in range(800):
            x=rng.uniform(25,497);y=447+sign*.39*(497-x)+13*math.sin(x/59)+rng.gauss(0,13)
            xx,yy=round(x),round(y);land.line((xx,yy,xx+rng.choice([1,2,3,4]),yy),fill=rng.choice(["#787967","#505b50","#5e6752","#84836c","#9a9378"]))
        for x in range(34,495,10):
            y=447+sign*.39*(497-x)+13*math.sin(x/59)
            stone(land,x+rng.randint(-4,4),round(y+rng.randint(-9,9)),rng.randint(3,9),rng.randint(2,5),rng.choice(["#7a7d6d","#7b806f","#697369","#8c8976"]))
    # Crumbling circular terrace around the beacon.
    bx,by=BEACON
    for row in range(3):
        count=[38,29,21][row]
        for i in range(count):
            a=2*math.pi*(i+row*.54)/count
            stone(land,round(bx+math.cos(a)*(60-row*11)),round(by+math.sin(a)*(30-row*6)),rng.randrange(4,9),rng.randrange(2,5),rng.choice(["#747d72","#686f66","#858577"]))
    for cx,cy,size in [(236,241,1),(127,215,1),(152,571,1),(288,604,1),(391,584,.7),(412,278,.6),(446,216,1),(292,249,.7),(195,417,.6),(550,79,1),(187,676,1)]:
        for _ in range(rng.randrange(5,13)):
            xx=cx+rng.randint(-34,36);yy=cy+rng.randint(-8,12)
            ww=round(rng.randint(13,40)*size);h=round(ww*.61)
            tile=components()["tidal-rock"].resize((ww,h),NEAR)
            stamp(ground,tile,xx,yy)
        for _ in range(rng.randrange(2,6)):
            spruce(land,cx+rng.randint(-36,34),cy+rng.randint(-9,9),rng.randrange(22,54),rng)
    stamp(ground,ruined_arch(),229,275)
    water=Image.new("RGBA",(W,H));sea=ImageDraw.Draw(water)
    for y in range(H):
        shade=.47+.32*math.sin(y/240)+.11*math.sin(y/52)
        sea.line((0,y,W,y),fill=between((6,22,46),(19,53,78),shade))
    # Long low waves break into offset, intermittent strokes along each crest.
    for row in range(-7,305):
        base=row*3
        for _ in range(rng.randrange(8,19)):
            xx=rng.randrange(465,W+20); length=rng.randint(7,55);amp=rng.choice([1,1,2])
            pts=[(x,round(base+amp*math.sin(x/10+row*.62)+2.1*math.sin(x/29+row*.17))) for x in range(xx,xx+length,2)]
            tone=rng.choice(["#20465d","#1c4058","#173850","#224861","#1c4057","#123046","#254b61"])
            sea.line(pts,fill=tone)
            if rng.random()<.2:sea.line([(x,y-1) for x,y in pts[:max(2,len(pts)//3)]],fill="#326177")
    # Distance to the lip controls the broken reflected rock and foam bands.
    for offset,width,tone in [(25,22,"#1b4053"),(22,12,"#254d5b"),(19,5,"#426774"),(17,3,"#7c9a99"),(12,11,"#192d3c")]:
        pts=[(shore(y)+offset+round(2*math.sin(y/3+offset)),y+10) for y in range(-20,H+10,2)]
        sea.line(pts,fill=tone,width=width)
    for _ in range(950):
        y=rng.randrange(H);x=shore(y)+rng.randrange(11,40)
        sea.line((x,y+9,x+rng.randrange(1,10),y+9),fill=rng.choice(["#8aa6a1","#64878d","#527782","#b0beb3","#315767"]))
    # Angular vertical planes use the same lip as the meadow.
    ridge=[(shore(y),y) for y in range(-12,H+12,6)]
    for i,((x,y),(xx,yy)) in enumerate(zip(ridge,ridge[1:])):
        depth=round(12+3*math.sin(y/28));nextdepth=round(12+3*math.sin(yy/28))
        col=rng.choice(["#354953","#41545c","#293b4b","#4e5b60"]) if xx>=x else rng.choice(["#182c3c","#233948","#293b49"])
        sea.polygon([(x-3,y),(xx-3,yy),(xx+nextdepth,yy+12),(x+depth,y+12)],fill=col)
        if i%3==0:sea.line((x+1,y+2,x+depth-1,y+11),fill="#647173")
    mask=Image.new("L",(W,H));ImageDraw.Draw(mask).polygon([(0,0)]+ridge+[(0,H)],fill=255)
    water.paste(ground,(0,0),mask)
    for i,((x,y),(xx,yy)) in enumerate(zip(ridge,ridge[1:])):
        sea.line((x-1,y,xx-1,yy),fill=rng.choice(["#828571","#a5a387","#646f63"]),width=2)
        if i%3==0:sea.line((x-2,y+1,xx-3,yy-2),fill="#737f59")
    # A group of partially submerged rock teeth interrupts the open water.
    for xx,yy,z in [(672,323,30),(691,317,20),(662,331,16),(593,505,29),(610,509,15),(689,583,37),(724,579,20),(798,399,30)]:
        sea.ellipse((xx-5,yy+z//3,xx+z+9,yy+z//2+5),outline="#80a0a2")
        stamp(water,components()["tidal-rock"].resize((z,max(8,z//2)),NEAR),xx,yy)
        sea.line((xx-2,yy+z//2-1,xx+z//2,yy+z//2),fill="#a1b5ae",width=2)
    stamp(water,components()["landing-pier"],shore(461)-6,461)
    return water


def soft_light(im, origin, end, beam):
    ox,oy=origin;ex,ey=end;dx,dy=ex-ox,ey-oy;mag=math.hypot(dx,dy);ux=dx/mag;uy=dy/mag
    # Pixel plate computed at half resolution and bilinearly filtered for optical light only.
    w,h=im.size;light=Image.new("RGBA",((w+1)//2,(h+1)//2));px=light.load()
    for j in range(light.height):
        for i in range(light.width):
            x,y=2*i-ox,2*j-oy
            along=x*ux+y*uy;side=abs(x*uy-y*ux)
            strength=0
            if beam and along>0:
                width=3+along*.21
                strength=124*math.exp(-2.1*(side/width)**2)*max(0,1-(along/(mag*1.75))**1.8)
            glow=103*math.exp(-.5*((x/12)**2+(y/9)**2))
            a=round(max(strength,glow))
            if a>=1:px[i,j]=(255,202,108,a)
    im.alpha_composite(light.resize(im.size,Image.Resampling.BILINEAR))


@lru_cache(12)
def world_view(w,h,mode):
    p=h>w;scale=.77 if p else 1
    tx,ty=BEACON;cx=round(w*.56);cy=round(h*(.52 if p else .585))
    def camera(x,y):
        return round(cx+(x-tx)*scale),round(cy+(y-ty)*scale)
    left,top=tx-cx/scale,ty-cy/scale
    bg=shore_plate().crop((round(left),round(top),round(left+w/scale),round(top+h/scale))).resize((w,h),NEAR)
    battle=mode in ("night","boss");boss=mode=="boss";invalid=mode in ("invalid","move")
    if battle:bg=Image.blend(bg,Image.new("RGBA",bg.size,"#071631"),.37)
    def put(name,x,y):
        tile=components()[name]
        if scale!=1:tile=tile.resize((round(tile.width*scale),round(tile.height*scale)),NEAR)
        stamp(bg,tile,*camera(x,y))
    def in_light(name,x,y):
        tile=components()[name].copy()
        if scale!=1:tile=tile.resize((round(tile.width*scale),round(tile.height*scale)),NEAR)
        mask=tile.getchannel("A")
        warm=Image.blend(tile,Image.new("RGBA",tile.size,"#ffde95"),.42)
        warm.putalpha(mask)
        rim=Image.new("RGBA",tile.size,"#ffe4a1")
        rim.putalpha(ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(5)),mask))
        left,top=camera(x,y); halo=Image.new("RGBA",(tile.width+24,tile.height+24))
        halo_mask=Image.new("L",halo.size);halo_mask.paste(mask.point(lambda v:v*3//5),(12,12))
        halo.paste((255,192,83,255),(0,0,*halo.size));halo.putalpha(halo_mask.filter(ImageFilter.GaussianBlur(4)))
        stamp(bg,halo,left-12,top-12);stamp(bg,rim,left,top);stamp(bg,warm,left,top)
    ink=ImageDraw.Draw(bg)
    if not battle:
        for radius,col in [(145,"#b29767"),(202,"#678996")]:
            for n in range(0,360,5):
                a=math.radians(n);xx,yy=camera(tx+radius*math.cos(a),ty+radius*.61*math.sin(a))
                ink.line((xx,yy,xx+2,yy),fill=col)
    # Static device shadows establish their feet and the plane of the ground.
    for gx,gy,r in [(497,448,32),(402,435,13),(415,496,16)]:
        x,y=camera(gx,gy);ink.ellipse((x-round(r*scale),y-2,x+round((r+5)*scale),y+4),fill="#344540" if not battle else "#263b3b")
    put("palisade",393,476)
    gx=590 if invalid else 401;gy=435
    put("shore-cannon",gx-17,gy-26)
    put("beacon",tx-40,ty-119)
    light_origin=camera(tx,ty-91);lit=camera(618,376) if boss else camera(313,373)
    soft_light(bg,light_origin,lit,battle)
    if battle:
        for name,gx,gy,v,maximum,is_lit in [
            ("ghost",340,388,13,34,True),("armored-turtle",298,402,34,42,False),
            ("ghost",336,490,34,34,False),("bat",606,392,25,25,False)]:
            if boss and name=="bat":continue
            if boss:is_lit=False
            tile=components()[name];x,y=camera(gx,gy)
            sw=round(tile.width*scale);sh=round(tile.height*scale)
            if name!="bat":
                ink.ellipse((x-sw//3,y-1,x+sw//3,y+3),fill="#283e43")
            (in_light if is_lit else put)(name,gx-tile.width//2,gy-tile.height)
            if is_lit:
                for sign in (-1,1):
                    xx=x+sign*(sw//2+3)
                    yt=y-sh+2;ink.line([(xx-sign*5,yt),(xx,yt),(xx,yt+5)],fill="#ffd084",width=2)
                    ink.line([(xx-sign*3,y-4),(xx,y-4),(xx,y-9)],fill="#ffce7f",width=2)
            yb=y-sh-5
            ink.rectangle((x-12,yb,x+12,yb+3),fill="#101e2a")
            ink.line((x-10,yb+1,x-10+round(20*v/maximum),yb+1),fill="#f4a387" if is_lit else "#d88279",width=2)
            if name=="armored-turtle":
                ink.line((x-10,yb-2,x+5,yb-2),fill="#a7b7cb",width=2)
        if boss:
            for name,gx,gy,hp in [("warden-core",651,459,None),("warden-tentacle",615,407,48),("warden-tentacle",608,514,76)]:
                (in_light if hp==48 else put)(name,gx-28,gy-51)
                if hp:
                    x,y=camera(gx,gy-52);ink.rectangle((x-15,y-2,x+15,y+2),fill=INK)
                    ink.line((x-13,y,x-13+round(26*hp/76),y),fill="#f1a284",width=2)
            x,y=camera(615,403)
            for a in range(0,360,18):
                ink.arc((x-33,y-12,x+33,y+10),a,a+11,fill="#f6af7d",width=2)
        x,y=lit
        ink.line([(x-6,y),(x,y-5),(x+6,y),(x,y+5),(x-6,y)],fill="#fff0bb")
    else:
        for gx2,gy2,kind in [(gx,gy,"bad" if invalid else "ok"),(411,498,"ok")]:
            x,y=camera(gx2,gy2);color="#ff957d" if kind=="bad" else "#f4c278"
            for sx in (-1,1):
                ink.line([(x+sx*21,y),(x+sx*21,y+4),(x+sx*15,y+4)],fill=color,width=2)
            if kind=="bad":
                ink.line((x-4,y+8,x+4,y+16),fill=color,width=2)
                ink.line((x+4,y+8,x-4,y+16),fill=color,width=2)
        if mode=="move":
            px,py=camera(426,407)
            for n in range(0,360,8):
                a=math.radians(n);xx=px+round(54*scale*math.cos(a));yy=py+round(25*scale*math.sin(a))
                ink.line((xx,yy,xx+2,yy),fill="#9fdab7")
            tile=components()["shore-cannon"].copy()
            if scale!=1:tile=tile.resize((round(tile.width*scale),round(tile.height*scale)),NEAR)
            mask=tile.getchannel("A");tile=Image.blend(tile,Image.new("RGBA",tile.size,"#a5ecc5"),.64)
            tile.putalpha(mask.point(lambda a:a*3//4));stamp(bg,tile,px-tile.width//2,py-tile.height+2)
            ink.line([(px-6,py+5),(px-1,py+9),(px+9,py-1)],fill="#baf3bc",width=3)
    return bg


NIGHT=("Крылатый прилив","Winged Tide")
SHORE=("Глава I  ·  Туманный берег","Chapter I  ·  Misty Shore")
DEVICES=("Устройства","Devices")
BASIC=("Базовая линза","Basic lens")
FLASH=("Вспышка","Flash")
START=("Начать ночь","Start night")
RECON=("Разведка","Recon")
UPGRADES=("Улучшения","Upgrades")
CLOSE=("Закрыть","Close")
STOCK=("В запас","Store")
CANNON=("Пушка #7","Cannon #7")
BRIEF=("Ночь 3  ·  Крылатый прилив","Night 3  ·  Winged Tide")


def group(ui,x,y,widths,height,items,gap=4):
    for width,args in zip(widths,items):
        ui.button(x,y,width,height,*args)
        x+=width+gap


def currency(ui,x,y):
    ui.button(x,y,66,44,"86 +","secondary","coin")
    ui.button(x+69,y,54,44,"1 +","secondary","pearl")


def prep_hud(ui, mode):
    w,h=ui.w,ui.h
    ui.button(4,4,44,44,"","secondary","back")
    headerw=174 if ui.p else 220
    ui.button(51,4,headerw,44,"","panel")
    ui.text(60,12,("Глава I  ·  Ночь 3","Chapter I  ·  Night 3") if ui.p else SHORE,10,"muted")
    ui.text(60,27,NIGHT if ui.p or ui.large else BRIEF,13,"gold")
    currency(ui,w-130,4)
    if ui.p:
        group(ui,4,52,[99,91,101,44],44,[(UPGRADES,"secondary",None if ui.large else "tree"),(RECON,"secondary",None if ui.large else "book"),(("Коллекция","Collection"),"secondary"),("+","secondary")],4)
        ui.panel(8,h-117,w-16,109)
        group(ui,15,h-113,[105,105,w-248],44,[(DEVICES,"secondary",None if ui.large else "cannon"),(("Линза","Lens") if ui.large else BASIC,"secondary","light" if ui.large else None),(FLASH,"secondary","charge")])
        ui.text(20,h-58,("На поле 2/4","Placed 2/4"),12,"ink")
        ui.text(20,h-38,("Типы 2/2","Types 2/2"),11,"muted")
        ui.button(w-179,h-66,161,48,START,"disabled" if mode!="prep" else "primary","lock" if mode!="prep" else "play")
    else:
        ui.button(w-353,4,105,44,UPGRADES,"secondary",None if ui.large else "tree")
        ui.button(w-245,4,109,44,RECON,"secondary","book")
        ui.button(8,53,94,44,("Коллекция","Collection"))
        ui.button(106,53,119,44,("Крупный план","Zoom in"))
        ui.panel(8,h-64,w-16,56)
        a=round(w*.205);b=round(w*.195)
        action_plate(ui,16,h-59,a,44,DEVICES,("2/4  ·  Типы 2/2","2/4  ·  Types 2/2"),"secondary","cannon")
        ui.button(20+a,h-59,b,44,BASIC,"secondary",None if ui.large else "light")
        ui.button(24+a+b,h-59,b-6,44,FLASH,"secondary","charge")
        sx=35+a+b*2
        ui.button(sx,h-59,w-sx-16,44,START,"disabled" if mode!="prep" else "primary","lock" if mode!="prep" else "play")


def rectify(ui, moving):
    if moving:
        w=ui.w-24 if ui.p else 304
        x=12;y=ui.h-(250 if ui.p else 186);height=110
        ui.panel(x,y,w,height)
        ui.icon("cannon",x+12,y+10);ui.text(x+34,y+11,("Перенос пушки #7","Move cannon #7"),15,"gold")
        ui.text(x+12,y+34,("Выберите место на суше.","Choose a spot on dry land."),12)
        ui.button(x+w-108,y+height-52,96,44,("Отмена","Cancel"))
    else:
        w=ui.w-24 if ui.p else 222
        x=12;y=ui.h-(257 if ui.p else 205);height=128
        ui.panel(x,y,w,height)
        ui.icon("cannon",x+11,y+10);ui.text(x+34,y+10,CANNON,16,"gold")
        ui.text(x+w-12,y+13,"54/70",12,"muted","rt")
        ui.text(x+12,y+39,("Устройство в воде.","Device is in the water."),12,"red")
        ui.text(x+12,y+56,("Для старта нужна суша.","Move it onto land to start."),11)
        half=(w-30)//2
        group(ui,x+12,y+76,[half,half],44,[(("Переставить","Move"),"selected"),(STOCK,)])


def combat_hud(ui,boss=False,device=False):
    w,h=ui.w,ui.h
    night=("Страж глубин","Abyss Warden") if boss else NIGHT
    phase=("Ночь 6  ·  Волны 2/4  ·  Отбито 1","Night 6  ·  Waves 2/4  ·  Cleared 1") if boss else ("Ночь 3  ·  Волны 2/4  ·  Отбито 1","Night 3  ·  Waves 2/4  ·  Cleared 1")
    if ui.p:
        ui.panel(8,8,143,48);ui.icon("light",17,16)
        ui.text(38,17,("Маяк","Beacon"),13);ui.text(142,18,"98/120",11,"ink","rt")
        ui.meter(17,39,124,9,98,120)
        ui.panel(154,8,w-204,48);ui.text(164,15,night,12 if ui.large else 13,"gold")
        ui.text(164,36,("Ночь 6  ·  00:47","Night 6  ·  00:47") if boss else ("Ночь 3  ·  00:47","Night 3  ·  00:47"),11,"muted")
        ui.button(w-49,8,44,46,"","secondary","pause")
        ui.panel(8,61,192,26,"inset");ui.text(18,69,("Волны 2/4  ·  Отбито 1","Waves 2/4  ·  Cleared 1"),11)
        ui.button(w-49,59,44,44,"i")
        if device:return
        y=h-118
        ui.panel(8,y,w-16,110)
        ui.icon("light",20,y+10);ui.text(43,y+14,BASIC,12)
        ui.text(20,y+38,("В свете 1/2","In light 1/2"),11,"cyan")
        ui.button(w-135,y+5,116,44,DEVICES,"secondary","cannon")
        aw=(w-38)//2
        action_plate(ui,16,y+54,aw,48,FLASH,("Готова","Ready"),"primary","charge")
        action_plate(ui,22+aw,y+54,aw,48,("Вызвать волну","Call wave"),("Через 00:13","Next in 00:13"),"secondary","wave")
    else:
        ui.panel(8,8,164,44);ui.icon("light",18,16)
        ui.text(42,15,("Маяк","Beacon"),14);ui.text(161,17,"98/120",11,"ink","rt");ui.meter(19,37,142,8,98,120)
        left=w//2-107
        ui.panel(left,6,214,47)
        ui.text(w//2,13,night,16,"gold","mt")
        ui.text(w//2,35,phase,10,"muted","mt")
        ui.panel(w-131,8,70,37);ui.text(w-96,26,"00:47",15,"ink","mm")
        ui.button(w-57,6,49,44,"","secondary","pause")
        if not device:ui.button(w-52,54,44,44,"i")
        y=h-61;ui.panel(8,y,w-16,53)
        ui.icon("light",19,y+11);ui.text(43,y+10,BASIC,13);ui.text(43,y+32,("В свете 1/2","In light 1/2"),11,"cyan")
        aw=(w-200)//3
        action_plate(ui,181,y+4,aw,44,FLASH,("Готова","Ready"),"primary","charge")
        action_plate(ui,185+aw,y+4,aw,44,("Вызвать волну","Call wave"),("Через 00:13","Next in 00:13"),"secondary","wave")
        ui.button(189+2*aw,y+4,aw,44,DEVICES,"secondary","cannon")
    if boss:
        y=94 if ui.p else 58
        ui.panel(8,y,176,41,"inset")
        ui.text(18,y+9,("Босс","Boss"),12)
        ui.text(173,y+10,"302 / 420",11,"ink","rt")
        ui.meter(18,y+26,155,8,302,420,"enemy")
        # Telegraph above the source; never covers the target sprite or its armor.
        tx=round(w*.56+(615-497)*(.77 if ui.p else 1));ty=round(h*(.52 if ui.p else .585)+(355-447)*(.77 if ui.p else 1))
        ww=142;xx=min(w-ww-6,max(6,tx-ww//2))
        ui.panel(xx,ty-39,ww,32,"inset")
        ui.text(xx+ww//2,ty-23,("Удар  ·  3,2 с","Strike  ·  3.2 s"),12,"red","mm")


def action_plate(ui,x,y,w,h,heading,detail,style,icon):
    ui.button(x,y,w,h,"",style)
    ui.icon(icon,x+8,y+h//2-8)
    size=13
    while ui.face(size).getlength(ui.tr(heading))>w-36 and size>9:size-=1
    ui.text(x+30,y+8,heading,size,"gold" if style=="primary" else "ink")
    ui.text(x+30,y+h-16,detail,10,"muted")


def device_commands(ui):
    w=ui.w-24 if ui.p else min(292,round(ui.w*.42));x=12 if ui.p else ui.w-w-8
    h=232;y=ui.h-h-(8 if ui.p else 66)
    ui.panel(x,y,w,h)
    ui.icon("cannon",x+13,y+13);ui.text(x+36,y+13,CANNON,16,"gold")
    ui.button(x+w-52,y+5,44,44,"×")
    ui.text(x+14,y+40,("Бой идёт  ·  54/70 HP","Battle live  ·  54/70 HP"),12,"cyan")
    ui.text(x+14,y+65,("Автоматический приоритет","Automatic priority"),12)
    labels=[(("Ближе","Nearest"),"selected"),(("Сильнее","Strongest"),),(("Слабее","Weakest"),)]
    group(ui,x+10,y+83,[(w-28)//3]*3,44,labels,4)
    group(ui,x+10,y+131,[(w-24)//2]*2,44,[(("Указать врага","Choose enemy"),),(("Автоцель","Auto target"),)],4)
    ui.button(x+10,y+179,w-20,44,("Характеристики  +","Stats  +"))


def shade(ui,amount=142):
    ui.im.alpha_composite(Image.new("RGBA",ui.im.size,(3,12,27,amount)))


def paused(ui,abandon):
    shade(ui,166)
    w=min(ui.w-32,386 if abandon else 290)
    h=(310 if ui.p else 290) if abandon else 235
    x=(ui.w-w)//2;y=(ui.h-h)//2
    ui.panel(x,y,w,h)
    ui.icon("exit" if abandon else "pause",x+17,y+19)
    ui.text(x+43,y+15,("Прервать эту ночь?","Abandon this night?") if abandon else ("Пауза","Paused"),20,"gold")
    if abandon:
        after=ui.wrap(x+16,y+48,w-32,("Награды и новые встречи этой ночи будут потеряны. Устройства вернутся к состоянию на старте. Покупки и ремонт подготовки сохранятся.","Rewards and new encounters from this night will be lost. Devices return to their starting condition. Preparation purchases and repairs are kept."),12)
        cy=max(after+8,y+h-154)
        ui.button(x+15,cy,w-30,44,("Остаться в паузе","Stay paused"),"primary","pause")
        ui.button(x+15,cy+49,w-30,44,("Прервать и открыть подготовку","Abandon and open preparation"))
        ui.button(x+15,cy+98,w-30,44,("Прервать и выйти в главное меню","Abandon and go to main menu"))
    else:
        ui.text(x+17,y+52,("Направление луча сохранено.","Beam direction is held."),12,"muted")
        for i,(name,style,icon) in enumerate([(("Продолжить ночь","Resume night"),"primary","play"),(("Настройки","Settings"),"secondary","gear"),(("Прервать ночь…","Abandon night…"),"secondary","exit")]):
            ui.button(x+15,y+80+i*48,w-30,44,name,style,icon)


def big_sprite(ui, name, x, y, size):
    src=components()[name];s=min(size/src.width,size/src.height)
    tile=src.resize((round(src.width*s),round(src.height*s)),NEAR)
    stamp(ui.im,tile,x+(size-tile.width)//2,y+(size-tile.height)//2)


def drawer(ui, slug):
    shade(ui,109)
    w=min(ui.w-18,414 if slug=="prep-catalog" else 358)
    h=369 if ui.p and slug=="prep-catalog" else 321
    x=(ui.w-w)//2 if ui.p else ui.w-w-8;y=(ui.h-h)//2
    ui.panel(x,y,w,h)
    names={"prep-catalog":DEVICES,"prep-lens":("Линза","Lens"),"prep-ability":("Способность","Ability"),
           "prep-recon":RECON,"prep-currency":("Осколки","Shards")}
    ui.text(x+16,y+16,names[slug],19,"gold")
    ui.button(x+w-82,y+5,72,44,CLOSE)
    if slug=="prep-catalog":
        ui.text(x+15,y+50,("Каталог типов","Device types"),12,"muted")
        keys=["shore-cannon","palisade","light-trap","harpoon","mortar","bell","generator","repair-lamp"]
        columns=4 if ui.p else 8
        bw=(w-28)//columns
        for n,key in enumerate(keys):
            xx=x+13+n%columns*bw;yy=y+70+n//columns*48
            ui.button(xx,yy,bw-4,44,"","gold" if n==0 else "inset")
            big_sprite(ui,key,xx+(bw-40)//2,yy+3,38)
        offset=48 if ui.p else 0
        ui.text(x+16,y+122+offset,("Пушка","Cannon"),16)
        ui.text(x+w-14,y+125+offset,("На поле 1/2","Placed 1/2"),11,"muted","rt")
        ui.text(x+16,y+147+offset,("70 HP  ·  Урон 16  ·  Дальность 160","70 HP  ·  Damage 16  ·  Range 160"),12)
        ui.button(x+13,y+167+offset,w-26,44,("Купить экземпляр  ·  20","Buy a cannon  ·  20"),"secondary","coin")
        ui.panel(x+11,y+216+offset,w-22,96,"inset")
        ui.text(x+20,y+227+offset,CANNON,14,"gold")
        ui.text(x+w-22,y+229+offset,("На поле  ·  54/70 HP","Placed  ·  54/70 HP"),11,"muted","rt")
        bw=(w-50)//3
        group(ui,x+18,y+257+offset,[bw,bw,bw],44,[(("Переставить","Move"),),(STOCK,),(("Ремонт  ·  2","Repair  ·  2"),)],5)
    elif slug=="prep-recon":
        ui.text(x+15,y+52,BRIEF,14)
        y1=ui.wrap(x+15,y+76,w-30,("Летучие мыши атакуют устройства с воды. Пушка не достаёт летающих.","Bats approach devices from the water. Cannons cannot hit flying enemies."),12,"muted")
        ui.panel(x+12,y1+6,w-24,59,"inset")
        for i,(label,value) in enumerate([(("Прочность","Integrity"),"120"),(("Целей луча","Beam targets"),"2"),(("Волн","Waves"),"4")]):
            xx=x+18+i*((w-36)//3);ui.text(xx,y1+15,label,11,"muted");ui.text(xx,y1+34,value,16,"gold")
        ui.text(x+16,y1+81,("Первая волна","First wave"),14)
        for i,(name,count) in enumerate([("ghost",6),("bat",2),("armored-turtle",2)]):
            xx=x+13+i*((w-22)//3)
            big_sprite(ui,name,xx,y1+103,38)
            ui.text(xx+45,y1+118,"×"+str(count),13)
    elif slug=="prep-currency":
        ui.icon("coin",x+15,y+67)
        ui.text(x+40,y+57,"86",29,"gold")
        ui.text(x+16,y+110,("Баланс осколков","Shard balance"),13,"muted")
        ui.panel(x+12,y+152,w-24,82,"inset")
        ui.text(x+23,y+166,("Видеопредложения","Video offers"),15)
        ui.wrap(x+23,y+195,w-48,("Видеопредложения пока недоступны.","Video offers are currently unavailable."),12,"muted")
    elif slug=="prep-lens":
        ui.panel(x+12,y+50,w-24,94,"inset")
        ui.icon("light",x+24,y+63);ui.text(x+50,y+63,BASIC,15,"gold")
        ui.text(x+24,y+94,("Ровный свет  ·  До двух целей","Steady beam  ·  Up to two targets"),12)
        ui.text(x+24,y+118,("Оснащена","Equipped"),11,"cyan")
        for i,(ru,en) in enumerate([("Расширенная","Expanded"),("Замедляющая","Slowing"),("Противоброневая","Armor breaker")]):
            ui.button(x+14,y+157+48*i,w-28,44,(ru,en),"disabled","lock")
    else:
        ids=[(("Без способности","No ability"),"secondary",None),(FLASH,"selected","check"),
             (("Перегрузка","Overload"),"disabled","lock"),(("Печать","Seal"),"disabled","lock"),
             (("Залп","Barrage"),"disabled","lock"),(("Бастион","Bastion"),"disabled","lock")]
        for i,(label,style,icon) in enumerate(ids):
            col=i%2;row=i//2;cw=(w-31)//2
            ui.button(x+14+col*(cw+3),y+54+row*48,cw,44,label,style,icon)
        ui.panel(x+12,y+204,w-24,104,"inset")
        ui.text(x+23,y+220,("Выбрана вспышка","Flash equipped"),15,"gold")
        ui.wrap(x+23,y+248,w-47,("Нажмите во время боя, чтобы оглушить существ рядом с маяком.","Activate in battle to stun enemies around the beacon."),12)


def draw(ui,slug):
    if slug not in SCREENS: raise KeyError(slug)
    night=slug in {"battle","battle-boss","battle-device","pause","abandon"}
    mode=("boss" if slug=="battle-boss" else "night") if night else {"placement-invalid":"invalid","placement-move":"move"}.get(slug,"prep")
    ui.im.alpha_composite(world_view(ui.w,ui.h,mode))
    if night:
        combat_hud(ui,slug=="battle-boss",slug=="battle-device")
        if slug=="battle-device":device_commands(ui)
        if slug in ("pause","abandon"):paused(ui,slug=="abandon")
    else:
        prep_hud(ui,mode)
        if mode in ("invalid","move"):rectify(ui,mode=="move")
        if slug.startswith("prep-"):drawer(ui,slug)


def export():
    OUT.mkdir(parents=True,exist_ok=True)
    for key,tile in components().items():tile.save(OUT/(key+".png"))
    ruined_arch().save(OUT/"ruined-arch.png")
    shore_plate().save(OUT/"headland.png",optimize=True)


if __name__=="__main__":
    export()
