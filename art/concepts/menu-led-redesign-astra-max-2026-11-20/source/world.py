"""A single projected headland for preparation and combat, with fixed world anchors."""
import json
import math
import random
from functools import lru_cache
from PIL import Image,ImageDraw,ImageOps,ImageEnhance
import material as m
from material import INK,DEEP,GOLD,IVORY,TEAL,RED,MUTED,STEEL
from lettering import ROOT
from layout import shade

DATA=json.loads((ROOT/"source/content.json").read_text(encoding="utf-8"))
SHORE=DATA["headland"]
PLACED={"cannon":(-146,-61),"light-trap":(-104,142)}
# Canonical samples for the same encounter in all orientations. No rule is simulated here.
NORMAL=(("ghost",-142,42,.48,True),("turtle",-231,91,.81,True),
        ("minotaur",-209,-155,.87,False),("bat",160,55,.7,False))
BOSS=(("tentacle",208,0,.56,True),("tentacle",116,-83,.56,True),
      ("tentacle",166,119,.56,False),("ghost",-170,105,.65,False),("turtle",-220,-70,.75,False))

def coastal_x(y):
    for (x0,y0),(x1,y1) in zip(SHORE,SHORE[1:]):
        if y<=y1:return x0+(x1-x0)*(y-y0)/(y1-y0)
    return SHORE[-1][0]

def camera(w,h):
    # Portrait exposes a longer stretch of coast. Nothing is independently moved.
    if h>w:return (w*.515,h*.525,.49)
    return (w*.508,h*.57,min(.73,w/815))

def proj(w,h,x,y):
    ox,oy,scale=camera(w,h)
    return (round(ox+x*scale),round(oy+y*.7*scale))

@lru_cache(maxsize=16)
def mat(key,size):
    w,h=size;src=m.TILES[key];tw,th=src.size
    out=Image.new("RGB",(w,h))
    for j in range((h+th-1)//th):
        for i in range((w+tw-1)//tw):
            tile=ImageOps.mirror(src) if (i+j*2)%2 else src
            if j%2:tile=ImageOps.flip(tile)
            out.paste(tile,(tw*i,th*j))
    return out

@lru_cache(maxsize=8)
def floor(w,h):
    ox,oy,s=camera(w,h);rng=random.Random(79)
    water=mat("sea",(w,h)).convert("RGBA")
    top=Image.new("L",(w,h));td=ImageDraw.Draw(top)
    points=[proj(w,h,coastal_x((y-oy)/(.7*s)),(y-oy)/(.7*s)) for y in range(-2,h+4,3)]
    td.polygon([(-1,-2)]+points+[(-1,h+2)],fill=255)
    under=[(x+6,y+10) for x,y in points]
    rock=Image.new("L",(w,h));rd=ImageDraw.Draw(rock);rd.polygon([(-1,-2)]+under+[(-1,h+15)],255)
    water.paste(mat("cliff",(w,h)),(0,0),rock)
    wd=ImageDraw.Draw(water)
    wd.line(under,fill="#4b687b",width=2)
    for i in range(2,len(under),2):
        x,y=under[i]
        if rng.random()<.75:
            wd.line((x,y+1,x+rng.randrange(2,10),y+2),fill=rng.choice(["#7a9ba7","#526d85","#284b64"]))
    heath=mat("heath",(w,h)).convert("RGBA")
    # Dark foreground paths anchor both maps and keep actors clear of bright patterns.
    heath=shade(heath,.32,"#152b3b")
    paths=Image.new("L",(w,h));pd=ImageDraw.Draw(paths)
    for trace in [[(-610,-305),(-280,-169),(-192,-118),(-115,-92),(-74,-32),(0,0)],
                  [(-560,255),(-300,184),(-236,149),(-168,102),(-77,74),(-43,24),(0,0)]]:
        pts=[proj(w,h,*p) for p in trace];pd.line(pts,fill=245,width=max(6,round(s*28)),joint="curve")
    road=shade(mat("paving",(w,h)),.38,"#152c40")
    heath.paste(road,(0,0),paths);water.paste(heath,(0,0),top)
    wd=ImageDraw.Draw(water)
    for i,(x,y) in enumerate(points):
        if i%7<4:
            wd.line((x-1,y,x+1,y+2),fill=rng.choice(["#607b87","#708895","#596f77"]))
    bx,by=proj(w,h,0,0)
    wd.polygon([(bx-33,by-2),(bx-19,by-9),(bx+16,by-10),(bx+31,by-5),(bx+34,by+4),
                (bx+20,by+11),(bx-17,by+13),(bx-32,by+7)],fill="#152636")
    dais=Image.new("L",(w,h));dd=ImageDraw.Draw(dais)
    foot=[(bx-32,by-4),(bx-17,by-10),(bx+15,by-10),(bx+31,by-4),(bx+30,by+3),
          (bx+16,by+8),(bx-16,by+9),(bx-32,by+3)]
    dd.polygon(foot,fill=255);water.paste(mat("paving",(w,h)),(0,0),dais)
    wd.line(foot[2:]+[foot[0]],fill="#62727d")
    for dx,dy in [(-28,5),(-16,9),(2,9),(18,7),(27,5)]:
        wd.line((bx+dx,by+dy,bx+dx+1,by+dy+3),fill="#30485b")
    for dx,dy in [(-27,-3),(-16,-7),(2,-8),(19,-6),(24,3),(-22,5)]:
        wd.line((bx+dx,by+dy,bx+dx+5,by+dy),fill="#66777c")
    return water

def dotted(d,begin,end,color,step=9,dash=4):
    x,y=begin;rx,ry=end;dist=math.hypot(rx-x,ry-y)
    if dist==0:return
    for t in range(0,round(dist),step):
        a=t/dist;b=min(1,(t+dash)/dist)
        d.line((round(x+(rx-x)*a),round(y+(ry-y)*a),round(x+(rx-x)*b),round(y+(ry-y)*b)),fill=color,width=1)

def reach(d,center,rx,ry,color,dashes=True):
    x,y=center
    if dashes:
        for a in range(0,360,12):
            d.arc((x-rx,y-ry,x+rx,y+ry),a,a+6,fill=color)
    else:d.ellipse((x-rx,y-ry,x+rx,y+ry),outline=color)

def draw_world(b,mode):
    w,h=b.size;ox,oy,s=camera(w,h);b.im.paste(floor(w,h))
    battle=mode in ("battle","boss","command","aim","pause","field")
    boss=mode=="boss"
    d=b.d;bx,by=proj(w,h,0,0)
    actors=[];status=[]
    for key,(x,y) in PLACED.items():
        if mode=="field" and key=="light-trap":continue
        if mode=="invalid" and key=="light-trap":x,y=126,105
        actors.append((key,x,y))
    actors.append(("beacon",0,0))
    if mode=="field":
        actors.extend([("generator",-124,109),("generator",-99,-156)])
        reach(d,(bx,by),round(155*s),round(155*s*.7),"#8ab2c7")
    cast=NORMAL if not boss else BOSS
    if battle:
        # Sector projected from the lantern toward each grounded hit position;
        # ground axis determines the two highlighted target brackets.
        direction=-.312 if boss else math.atan2(55,-156)
        oy_light=by-m.SPRITES["world-beacon"].height+17; length=300
        layer=Image.new("RGBA",(w,h));ld=ImageDraw.Draw(layer)
        for spread,opacity in [(.225,23),(.184,34),(.142,49),(.093,64),(.045,77)]:
            if boss:spread*=20/12
            full=[]
            for i in range(13):
                ang=direction-spread+2*spread*i/12
                tx,ty=proj(w,h,math.cos(ang)*length,math.sin(ang)*length)
                full.append((tx,ty-9))
            for fraction,fade in [(1.0,.16),(.98,.28),(.96,.39),(.93,.53),(.89,.68),(.85,.81),(.80,.92),(.75,1)]:
                tips=[(round(bx+(tx-bx)*fraction),round(oy_light+(ty-oy_light)*fraction)) for tx,ty in full]
                ld.polygon([(bx,oy_light)]+tips,fill=(250,195,103,round(opacity*fade)))
        b.im.alpha_composite(layer)
        for i,(name,x,y,hp,lit) in enumerate(cast):
            actors.append((name,x,y));status.append((name,x,y,hp,lit))
        ax,ay=proj(w,h,*( (166,119) if boss else (-209,-155) ))
        tx,ty=proj(w,h,0,0)
        # A telegraph begins at its source. Separate it from the beam by hue and dash.
        dotted(d,(ax,ay),(tx,ty),RED,8,3)
        reach(d,(tx,ty),15,7,RED)
    elif mode in ("placing","invalid"):
        xy=proj(w,h,*(PLACED["cannon"] if mode=="placing" else (126,105)))
        reach(d,(bx,by),round(300*s),round(210*s),"#73a5a2")
        reach(d,xy,17,8,TEAL if mode=="placing" else RED,False)
    for name,x,y in sorted(actors,key=lambda a:a[2]):
        px,py=proj(w,h,x,y);sp=m.SPRITES["world-"+name];an=m.ANCHORS["world-"+name]
        d.ellipse((px-sp.width//3,py-3,px+sp.width//3,py+3),fill="#0a1a29")
        b.im.alpha_composite(sp,(px-an[0],py-an[1]))
    for name,x,y,hp,lit in status:
        px,py=proj(w,h,x,y);sp=m.SPRITES["world-"+name];sy=py-sp.height-6
        if lit:
            from PIL import ImageFilter, ImageChops
            left,top=px-sp.width//2,py-sp.height+2
            mask=sp.getchannel("A");edge=ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(3)),mask)
            b.im.paste("#f4cb7d",(left,top),edge)
            # Distant corners leave the actor's face and HP untouched.
            b.im.alpha_composite(m.sliced("target-lit",(sp.width+6,sp.height+6)),(left-3,top-3))
        if name=="tentacle":
            # Two destructible parts have local durability in addition to the
            # common owner. The central zone remains a permanent HP target.
            if (x,y)!=(208,0):
                b.sprite("part-durability",px-12,sy-2)
                if not lit:
                    for j in (3,4):d.rectangle((px-12+5*j,sy,px-10+5*j,sy+2),fill="#a5c7d1")
            continue
        ww=22;b.sprite("foe-lit-health" if lit else "foe-health",px-12,sy-1)
        d.rectangle((px-11,sy,px-11+ww-1,sy+2),fill="#4b4b4b")
        d.rectangle((px-11,sy,px-11+max(1,round(ww*hp))-1,sy+2),fill=("#d5deb0" if lit else "#8cbaa8"))
        if name=="turtle":
            b.sprite("foe-armor",px-12,sy+2)
    if battle:
        x,y=proj(w,h,*( (166,119) if boss else (-209,-155) ))
        b.icon("warning",x+10,y-35)
    if mode=="aim":
        px,py=proj(w,h,-54,-160);reach(d,(px,py),24,14,TEAL,False);b.icon("target",px-10,py-11)
    if mode=="invalid":
        px,py=proj(w,h,126,105);b.icon("warning",px+8,py-27)
    return proj(w,h,0,0)

def map_key(b):
    # Compass and scale are ancillary cues outside combat's threat area.
    x=18;y=75
    b.icon("recon",x,y)
