"""Original pixel components and export. Coordinates are logical pixels."""
import json
import random
from pathlib import Path
from functools import lru_cache
from PIL import Image, ImageDraw, ImageOps, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
NEAR = Image.Resampling.NEAREST
ART = ROOT / 'art-source'
INK = '#091524'
BLUE = '#152e4d'
SLATE = '#284968'
EDGE = '#84634f'
COPPER = '#f28345'
GOLD = '#ffcf92'
PAPER = '#fee3b7'
TEXT = '#e4e2d9'
MUTED = '#a8b8c7'
TEAL = '#87d2c5'
RED = '#f18c76'
SPRITES = {}
FRAMES = {}
VISTAS = []
ACTORS = {}

def canvas(w,h):
    return Image.new('RGBA',(w,h))

def octagon(x,y,w,h,cut):
    r=x+w-1; b=y+h-1
    return [(x+cut,y),(r-cut,y),(r,y+cut),(r,b-cut),(r-cut,b),(x+cut,b),(x,b-cut),(x,y+cut)]

def plate(kind, state):
    w,h=(240,48) if kind=='button' else (48,36)
    im=canvas(w,h); d=ImageDraw.Draw(im)
    bright=state in ('selected','hover','focus')
    disabled=state=='disabled'
    inset=2 if state=='pressed' else 0
    rim=('#586572' if disabled else GOLD if bright else COPPER) if kind=='button' or bright else EDGE
    if kind=='parchment':
        base,flint,lit='#d4b387','#d2b186','#d6b68b'
    elif kind=='panel':
        base,flint,lit='#101f32','#112035','#122238'
    else:
        base,flint,lit=('#1c2734','#24313d','#2c3945') if disabled else (BLUE,'#183452','#1b395b')
    for i,col in enumerate([INK,rim,'#b67551' if not disabled else '#495869', '#48392e' if not disabled else '#35414e',base]):
        d.polygon(octagon(i,i+inset,w-2*i,h-2*i-inset,max(1,8-i)),fill=col)
    rng=random.Random(123)
    for _ in range(w*h//37):
        x=rng.randrange(6,w-10);y=rng.randrange(6,h-7)
        d.line([(x,y),(x+3,y),(x+4,y+1),(x+6,y+1)],fill=rng.choice([flint,lit]),width=2)
    if not disabled:
        d.line((10,1+inset,w-11,1+inset),fill='#ffc18a' if bright or kind=='button' else '#a38469')
    if kind=='button' and not disabled:
        d.line((10,2+inset,w-11,2+inset),fill=PAPER if bright else '#f6a86e');d.line((10,3+inset,w-11,3+inset),fill=GOLD if bright else '#f4a46a')
        d.line((10,h-3,w-11,h-3),fill=COPPER)
    if state=='selected':
        d.polygon([(4,8),(9,4),(9,8)],fill=PAPER)
    if state=='focus':
        for x in range(12,w-12,5):
            d.line((x,5,x+1,5),fill=PAPER);d.line((x,h-6,x+1,h-6),fill=PAPER)
    return im

def pictogram(name):
    im=canvas(19,19); d=ImageDraw.Draw(im)
    def line(pts,c=GOLD,w=2): d.line(pts,fill=c,width=w)
    def poly(pts,c): d.polygon(pts,fill=c)
    def box(rect,c): d.rectangle(rect,fill=c)
    if name in ('shard','diamond'):
        poly([(9,1),(15,7),(13,12),(8,17),(3,10)],COPPER)
        poly([(9,1),(10,7),(8,14),(5,9)],PAPER);line([(10,7),(14,7)],GOLD,1)
    elif name=='pearl':
        d.ellipse((3,3,15,15),fill='#6d829d');d.ellipse((3,3,13,13),fill='#b8cbde');d.ellipse((5,4,9,7),fill='#fff2d9')
    elif name=='lock':
        d.arc((5,2,13,12),180,360,fill=MUTED,width=2);box((4,9,14,16),'#899bab');box((8,11,10,13),INK)
    elif name in ('check','back','next','down','close','pause','plus','aim','warning','flash'):
        if name=='check': line([(2,9),(7,14),(16,4)],TEAL,3)
        elif name=='back':line([(11,3),(5,9),(11,15)]);line([(6,9),(16,9)])
        elif name=='next':line([(6,3),(12,9),(6,15)])
        elif name=='down':line([(3,6),(9,12),(15,6)])
        elif name=='close': line([(3,3),(15,15)]);line([(15,3),(3,15)])
        elif name=='pause': box((4,3,7,15),PAPER);box((11,3,14,15),PAPER)
        elif name=='plus': line([(3,9),(15,9)]);line([(9,3),(9,15)])
        elif name=='warning':poly([(9,1),(17,16),(1,16)],RED);line([(9,6),(9,10)],INK);box((9,12,10,13),INK)
        elif name=='flash':poly([(10,0),(2,11),(8,10),(6,18),(17,6),(11,7)],GOLD)
        else: d.ellipse((4,4,14,14),outline=GOLD);line([(9,0),(9,6)]);line([(9,12),(9,18)]);line([(0,9),(6,9)]);line([(12,9),(18,9)])
    elif name=='beacon':
        poly([(9,0),(15,5),(3,5)],COPPER);box((5,6,13,9),GOLD);box((8,6,9,9),INK);poly([(6,10),(12,10),(15,17),(3,17)],MUTED);box((8,14,10,17),INK)
    elif name=='book':
        poly([(1,3),(7,3),(9,5),(11,3),(17,3),(17,15),(11,15),(9,17),(7,15),(1,15)],'#b78d63');line([(3,5),(6,5),(8,7)],PAPER);line([(10,7),(13,5),(15,5)],PAPER);line([(9,7),(9,15)],INK,1)
    elif name=='lens':
        d.ellipse((2,2,13,13),fill=COPPER);d.ellipse((4,4,11,11),fill='#6d9eae');line([(5,8),(8,5)],PAPER);line([(12,12),(17,17)],COPPER,3)
    elif name=='cannon':
        d.ellipse((3,10,12,17),fill='#9198a0');d.ellipse((6,12,9,15),fill=INK);poly([(3,7),(14,2),(17,6),(6,12)],COPPER);line([(4,7),(13,3)],PAPER)
    elif name=='tree':
        line([(9,16),(9,11),(4,6),(4,3)],MUTED);line([(9,11),(14,6),(14,3)],MUTED);line([(9,10),(9,2)],COPPER);box((2,2,5,5),TEAL);box((12,2,15,5),TEAL);box((7,13,11,17),GOLD)
    elif name=='wave':
        for y in (5,10,15):line([(1,y),(5,y-2),(9,y),(13,y-2),(17,y)],'#91bdd3',1)
    elif name=='bag':
        poly([(5,1),(13,1),(11,6),(15,10),(16,14),(12,17),(5,17),(2,13),(4,9),(7,6)],'#ad7655');line([(6,6),(12,6)],PAPER);box((8,9,10,14),GOLD)
    elif name=='ship':
        poly([(2,12),(17,12),(12,17),(6,17)],COPPER);line([(9,1),(9,12)],GOLD,1);poly([(8,2),(3,10),(8,10)],PAPER);poly([(10,3),(15,9),(10,9)],MUTED)
    elif name=='sound':
        poly([(2,7),(5,7),(10,3),(10,15),(5,11),(2,11)],GOLD);d.arc((6,2,17,16),285,75,fill=MUTED,width=2)
    elif name=='gear':
        for rect in [(7,1,11,17),(1,7,17,11),(4,4,14,14)]:box(rect,COPPER)
        d.ellipse((5,5,13,13),fill=GOLD);d.ellipse((7,7,11,11),fill=INK)
    elif name=='shield':
        poly([(2,3),(9,1),(16,3),(15,11),(9,17),(3,11)],MUTED);poly([(4,5),(9,3),(9,14),(5,10)],TEAL)
    elif name=='moon':
        d.ellipse((2,1,16,16),fill=PAPER);d.ellipse((8,0,18,12),fill=(0,0,0,0))
    return im

def build():
    for k,states in {'button':['normal','hover','focus','pressed','disabled'],'panel':['normal'],'tab':['normal','selected','disabled'],'parchment':['normal']}.items():
        for s in states:
            key=f'{k}-{s}';SPRITES[key]=plate(k,s);FRAMES[key]=10
    for name,source in [('frame-stone','panel-normal'),('frame-parchment','parchment-normal')]:
        rim=SPRITES[source].copy()
        ImageDraw.Draw(rim).polygon(octagon(4,4,rim.width-8,rim.height-8,4),fill=(0,0,0,0))
        SPRITES[name]=rim;FRAMES[name]=10
    for name in 'shard diamond pearl lock check back next down close pause plus aim warning flash beacon book lens cannon tree wave bag ship sound gear shield moon'.split():
        SPRITES['icon-'+name]=pictogram(name)
    for key,col in [('health',TEAL),('armor','#a7c3dd'),('light',GOLD),('danger',RED),('empty','#2a4054')]:
        im=canvas(24,6); d=ImageDraw.Draw(im);d.rectangle((0,0,23,5),fill=INK);d.rectangle((1,1,22,4),fill=col);d.line((2,1,21,1),fill=TEXT if key!='empty' else SLATE)
        for point in [(0,0),(23,0),(0,5),(23,5)]:im.putpixel(point,(0,0,0,0))
        SPRITES['meter-'+key]=im
    j=Image.open(ART/'journal.png').convert('RGB')
    for i in range(8):
        x=(i%2)*768;y=(i//2)*256
        VISTAS.append(j.crop((x+2,y+1,x+766,y+255)).resize((510,170),Image.Resampling.LANCZOS).quantize(96,dither=Image.Dither.NONE).convert('RGB'))
    sheet=Image.open(ART/'actors.png').convert('RGBA')
    for name,box,size in [('beacon',(0,0,592,694),78),('cannon',(615,0,1261,680),27),('ghost',(0,695,591,1200),25),('turtle',(558,695,1261,1247),32)]:
        a=sheet.crop(box); mask=a.getchannel('A').point(lambda n:255 if n>=140 else 0)
        # Separate the turtle's left claw from the ghost's tail at their shared x range.
        if name in ('ghost','turtle'):
            md=ImageDraw.Draw(mask)
            if name=='ghost':md.polygon([(590,285),(590,510),(550,510),(550,395)],fill=0)
            else:md.polygon([(0,0),(78,0),(26,285),(0,306)],fill=0)
        a.putalpha(mask);a=a.crop(a.getbbox());a.thumbnail((size,size),Image.Resampling.LANCZOS)
        mask=a.getchannel('A').point(lambda v:255 if v>=128 else 0)
        a=a.convert('RGB').quantize(44,dither=Image.Dither.NONE).convert('RGBA');a.putalpha(mask)
        ACTORS[name]=a;SPRITES['world-'+name]=a
    tip=canvas(29,38);d=ImageDraw.Draw(tip)
    d.polygon([(2,37),(4,28),(12,22),(15,15),(11,8),(12,3),(18,1),(24,3),(27,9),(23,7),(19,6),(17,8),(22,16),(21,24),(14,30),(14,37)],fill='#152137',outline='#7692a7')
    d.line([(4,34),(8,28),(15,24),(18,16),(14,9),(15,5),(20,3)],fill='#7792a6',width=2)
    for xx,yy in [(8,32),(11,29),(14,26),(17,22),(18,17),(16,12)]:d.rectangle((xx,yy,xx+2,yy+1),fill='#e5a180')
    SPRITES['world-tentacle']=tip
    for k in ['beacon','cannon','ghost','turtle']:
        assert ACTORS[k].getbbox()
    im=Image.open(ART/'ground.png').convert('RGB'); half=im.width//2
    for i,name in enumerate(['land','sea']):
        box=(i*half+3,3,(i+1)*half-3,im.height-3)
        SPRITES['terrain-'+name]=im.crop(box).resize((360,360),Image.Resampling.LANCZOS).quantize(48,dither=Image.Dither.NONE).convert('RGBA')

@lru_cache(256)
def nine(key,w,h):
    src=SPRITES[key]; n=FRAMES[key]; out=canvas(w,h)
    # Tile all edges and the stone field to preserve pixel grain.
    for ix,(a,b,x,z) in enumerate([(0,n,0,n),(n,src.width-n,n,w-n),(src.width-n,src.width,w-n,w)]):
        for iy,(c,d,y,t) in enumerate([(0,n,0,n),(n,src.height-n,n,h-n),(src.height-n,src.height,h-n,h)]):
            tile=src.crop((a,c,b,d))
            for yy in range(y,t,tile.height):
                for xx in range(x,z,tile.width):
                    piece=tile.crop((0,0,min(tile.width,z-xx),min(tile.height,t-yy)))
                    out.paste(piece,(xx,yy))
    return out

def export(out):
    dest=out/'sprites';dest.mkdir(parents=True,exist_ok=True)
    sheet=canvas(512,512);x=y=height=0;records={}
    for name,img in SPRITES.items():
        img.save(dest/(name+'.png'));file='sprites/'+name+'.png'
        row={'file':file,'size':list(img.size)}
        if name in FRAMES:row['nineSlice']=[10,10,10,10];row['fill']='tile'
        if name.startswith('world-'):row['anchor']=[img.width//2,img.height-1]
        if not name.startswith('terrain-'):
            if x+img.width+1>512:x=0;y+=height+2;height=0
            sheet.paste(img,(x,y));row['atlas']=[x,y,img.width,img.height];x+=img.width+2;height=max(height,img.height)
        records[name]=row
    sheet.crop((0,0,512,y+height)).save(dest/'atlas.png')
    (dest/'manifest.json').write_text(json.dumps(records,indent=2),encoding='utf8')
    for i,img in enumerate(VISTAS):
        (out/'illustrations').mkdir(exist_ok=True);img.save(out/'illustrations'/('epilogue.png' if i==7 else f'chapter-{i+1:02}.png'))

