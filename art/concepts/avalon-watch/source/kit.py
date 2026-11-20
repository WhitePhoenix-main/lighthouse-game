"""Original native-pixel interface kit. The exported PNGs are the compositor's actual inputs."""
from functools import lru_cache
from pathlib import Path
import json
import random

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT.parents[2]
SPRITES = ROOT / "sprites" / "ui"
FONT = GAME / "public/fonts/menu/VollkornSC-Regular.ttf"
C = dict(ink="#ffe3ad", gold="#ffc671", muted="#bbccd2", cyan="#a0d6d4", red="#ffad8a",
         void="#091522", edge="#0d2036", stone="#152e4d", vein="#19395d",
         brass="#8f4822", copper="#e89a48", shadow="#1d1312")
STYLES = ("panel", "inset", "gold", "primary", "secondary", "disabled", "pressed",
          "hover", "focus", "tab", "selected", "frame")
MARGINS = (9, 9, 9, 9)
N = Image.Resampling.NEAREST

def bevel(d, x, y, r, b, cut, color):
    d.polygon([(x+cut,y),(r-cut,y),(r,y+cut),(r,b-cut),(r-cut,b),
               (x+cut,b),(x,b-cut),(x,y+cut)],fill=color)

def make_plate(style):
    w, h = 50, 32
    im = Image.new("RGBA", (w,h))
    d = ImageDraw.Draw(im)
    hot = style in ("primary","selected","gold","hover","focus","pressed")
    rim = "#dfa065" if hot else "#566978"
    if style == "disabled": rim = "#394952"
    if style == "inset": rim = "#30475a"
    bevel(d,0,0,w-1,h-1,5,C["void"])
    bevel(d,1,1,w-2,h-3,4,"#603a2e" if hot else "#273847")
    bevel(d,2,1,w-3,h-4,3,rim)
    bevel(d,3,3,w-4,h-5,3,"#8f552e" if hot else "#1c3244")
    base = {"inset":"#0d2033","panel":"#142a42","gold":"#172e47","disabled":"#1b2c3b",
            "pressed":"#10273f","hover":"#204264","focus":"#204264"}.get(style,C["stone"])
    bevel(d,4,4,w-5,h-6,2,base)
    d.line((6,1,w-7,1),fill="#ffe0a6" if hot else "#758490")
    d.line((6,h-4,w-7,h-4),fill="#a76539" if hot else "#364a59")
    rng=random.Random(815)
    for _ in range(14 if style in ("panel","gold","inset") else 21):
        x,y=rng.randint(6,w-8),rng.randint(6,h-9)
        fill=(("#183552","#1b3756") if hot else ("#172e46","#193149"))
        if style in ("inset","disabled"): fill=("#152b3b","#172d3e")
        d.line((x,y,min(w-7,x+rng.randrange(1,5)),y),fill=rng.choice(fill))
    for x in (5,w-7):
        d.point((x,4),fill="#ffe3ad" if hot else "#94a4a6")
    if style in ("primary","pressed","hover","focus"):
        for x in (2,w-5):
            d.rectangle((x,11,x+2,19),fill="#9b6142")
            d.line((x,12,x,17),fill="#f4bb83")
            d.point((x+1,15),fill="#714535")
    if style in ("focus","hover"):
        d.line((8,3,w-9,3),fill="#fee4ab")
    if style=="focus":
        for x,y,dx,dy in [(2,2,1,1),(w-3,2,-1,1),(2,h-3,1,-1),(w-3,h-3,-1,-1)]:
            d.line((x,y,x+dx*6,y),fill="#ffe1b2")
            d.line((x,y,x,y+dy*6),fill="#ffe1b2")
    if style=="selected":
        d.line((7,h-6,w-8,h-6),fill=C["gold"])
    if style=="frame":
        bevel(d,4,4,w-5,h-6,2,(0,0,0,0))
    return im

# Twelve- to sixteen-pixel pictograms share the amber bevel and dark silhouette.
def make_icon(name):
    im=Image.new("RGBA",(16,16))
    d=ImageDraw.Draw(im)
    a,g,l,s=C["copper"],C["gold"],C["ink"],C["brass"]
    blue,hi="#668fa0","#aad6d7"
    def poly(points,col=g): d.polygon(points,fill=col)
    def line(points,col=l,width=1): d.line(points,fill=col,width=width)
    if name in ("back","play","exit"):
        if name=="back":
            poly([(2,7),(8,1),(8,5),(14,5),(14,10),(8,10),(8,14)])
            line([(3,7),(7,3)]);line([(8,10),(13,10)],s)
        else:
            poly([(4,2),(13,8),(4,14)],a);line([(4,2),(12,7)]);line([(5,4),(5,11)],g)
            if name=="exit":line([(12,2),(14,2),(14,13),(12,13)],hi)
    elif name=="pause":
        for x in (3,9): d.rectangle((x,2,x+3,13),fill=a);line([(x,2),(x+2,2)]);line([(x,3),(x,11)],g)
    elif name in ("coin","pearl","target","gear","charge"):
        if name=="coin":
            poly([(8,0),(14,6),(9,14),(6,15),(1,8)],blue)
            poly([(8,1),(10,6),(6,13),(3,8)],hi);poly([(10,6),(14,6),(8,14)],"#47768d")
            line([(4,7),(8,2)],"#e9f3df")
        elif name=="pearl":
            d.ellipse((2,2,13,14),fill="#3a536c");d.ellipse((2,2,12,12),fill=blue);d.ellipse((3,2,11,10),fill=hi);d.rectangle((5,3,7,4),fill=l)
        elif name=="charge":poly([(8,1),(13,1),(9,6),(14,6),(5,15),(7,9),(2,9)],g)
        else:
            for bbox,col in [((2,2,13,13),a),((4,4,11,11),C["stone"]),((6,6,9,9),g)]: d.ellipse(bbox,fill=col)
            for x,y,x2,y2 in [(7,0,8,3),(7,12,8,15),(0,7,3,8),(12,7,15,8)]:d.rectangle((x,y,x2,y2),fill=g)
            if name=="gear":
                for x,y in [(2,2),(11,2),(2,11),(11,11)]:d.rectangle((x,y,x+2,y+2),fill=a)
    elif name=="heart":
        poly([(1,4),(3,2),(5,2),(8,5),(10,2),(12,2),(15,5),(14,8),(8,14),(2,8)],"#c26b59");line([(2,5),(4,3),(5,3)],"#ffd6a7")
    elif name=="shield":
        poly([(1,2),(8,1),(14,2),(13,9),(8,15),(3,11)],hi);poly([(4,4),(8,3),(12,4),(11,9),(8,12),(5,9)],blue);line([(8,4),(8,10)],C["stone"])
    elif name in ("repair","cannon"):
        if name=="cannon":
            poly([(2,8),(11,2),(14,5),(5,11)],blue);line([(2,8),(11,2)],hi);d.ellipse((3,9,9,15),fill=a);d.point((6,12),fill=l);line([(9,11),(13,13)],g,2)
        else:
            poly([(2,12),(9,5),(9,2),(12,0),(11,4),(13,5),(15,3),(15,7),(12,8),(5,15)],hi);line([(4,12),(9,7)],blue)
    elif name=="book":
        poly([(0,2),(5,2),(8,4),(10,2),(15,2),(15,13),(10,13),(8,15),(5,13),(0,13)],s)
        poly([(1,2),(5,2),(7,4),(7,12),(5,11),(1,11)],g);poly([(8,4),(11,2),(14,2),(14,11),(10,11),(8,13)],l)
        for y in (5,8):line([(2,y),(4,y),(5,y+1)],a);line([(10,y+1),(12,y)],a)
    elif name in ("tree","trap"):
        if name=="tree":
            line([(8,3),(8,8),(3,8),(3,12)],a);line([(8,8),(13,8),(13,12)],a)
            for x,y in [(8,3),(3,12),(13,12)]:poly([(x,y-2),(x+2,y),(x,y+2),(x-2,y)])
        else:
            poly([(0,6),(4,9),(5,5),(8,10),(11,5),(12,9),(15,6),(13,13),(3,13)],hi);line([(4,13),(12,13)],blue)
    elif name in ("generator","light"):
        poly([(3,14),(5,8),(5,4),(11,4),(11,8),(13,14)],blue);d.rectangle((5,5,10,8),fill=g)
        line([(7,6),(9,6)]);poly([(3,4),(8,0),(13,4)],a);line([(3,14),(13,14)],hi)
        if name=="generator":line([(1,6),(1,10)],hi);line([(14,6),(14,10)],hi)
    elif name=="lock":
        d.arc((4,1,11,10),180,360,fill=l,width=2);d.rectangle((3,7,12,14),fill=a);d.rectangle((7,9,8,11),fill=s)
    elif name=="check":line([(1,8),(6,13),(14,3)],s,3);line([(1,6),(6,11),(14,1)],hi,2)
    elif name=="wave":
        for y in (4,9):line([(0,y+2),(3,y+2),(6,y-1),(8,y-1),(10,y+2),(14,y+2)],hi,2)
    else:raise KeyError(name)
    return im

ICONS="back pause play shield heart gear coin pearl repair charge trap generator cannon tree book exit check lock light wave target".split()
BARS={"health":"#a5ccaa","shield":"#91ccde","enemy":"#ef9975","armor":"#b1b6c5"}

def export():
    SPRITES.mkdir(parents=True,exist_ok=True)
    entries={}
    def save(name,im,**meta):
        im.save(SPRITES/(name+".png"))
        entries[name]=dict(file="sprites/ui/"+name+".png",width=im.width,height=im.height,**meta)
    for style in STYLES: save(style,make_plate(style),sliceLTRB=MARGINS,fill="tile")
    for name in ICONS: save("icon-"+name,make_icon(name))
    from front import gateway
    save("gatehouse",gateway())
    knob=Image.new("RGBA",(11,16));kd=ImageDraw.Draw(knob)
    bevel(kd,0,0,10,15,3,C["shadow"]);bevel(kd,1,1,9,13,2,C["copper"])
    kd.line((3,2,7,2),fill=C["ink"]);kd.line((5,5,5,10),fill=C["brass"])
    save("slider-thumb",knob)
    for kind,color in BARS.items():
        im=Image.new("RGBA",(4,5));d=ImageDraw.Draw(im)
        d.rectangle((0,0,3,4),fill=color);d.line((0,0,3,0),fill="#e4dbbd");d.line((0,4,3,4),fill="#516176")
        save("fill-"+kind,im,fill="tile")
    im=Image.new("RGBA",(12,9));bevel(ImageDraw.Draw(im),0,0,11,8,2,"#6f7783")
    bevel(ImageDraw.Draw(im),1,1,10,7,1,C["void"]);save("meter",im,sliceLTRB=[3,3,3,3],fill="tile")
    (ROOT/"sprites"/"ui.json").write_text(json.dumps(entries,indent=2),encoding="utf-8")

@lru_cache(maxsize=250)
def sprite(name):return Image.open(SPRITES/(name+".png")).convert("RGBA")

@lru_cache(maxsize=1800)
def sliced(name,w,h,margins=MARGINS):
    src=sprite(name)
    l,t,r,b=margins
    out=Image.new("RGBA",(w,h))
    xx=(0,l,w-r,w);yy=(0,t,h-b,h)
    sx=(0,l,src.width-r,src.width);sy=(0,t,src.height-b,src.height)
    for iy in range(3):
        for ix in range(3):
            tile=src.crop((sx[ix],sy[iy],sx[ix+1],sy[iy+1]))
            for y in range(yy[iy],yy[iy+1],tile.height):
                for x in range(xx[ix],xx[ix+1],tile.width):
                    out.paste(tile.crop((0,0,min(tile.width,xx[ix+1]-x),min(tile.height,yy[iy+1]-y))),(x,y))
    return out

@lru_cache(maxsize=48)
def font(size):return ImageFont.truetype(str(FONT),size)
@lru_cache(maxsize=8)
def hero_image(name):return Image.open(ROOT/"illustrations"/(name+".png")).convert("RGBA")

class UI:
    def __init__(self,w,h,lang="ru",large=False):
        self.im=Image.new("RGBA",(w,h),C["void"]);self.w=w;self.h=h
        self.p=h>w;self.lang=lang;self.large=large;self.bounds=[];self.warnings=[]
        d=ImageDraw.Draw(self.im)
        for y in range(h):
            t=y/h
            color=(int(14+5*(1-t)),int(28+12*(1-t)),int(44+18*(1-t)))
            d.line((0,y,w,y),fill=color)
        rng=random.Random(9204)
        for _ in range(w*h//170):
            x=rng.randrange(w);y=rng.randrange(h)
            d.line((x,y,x+rng.randrange(1,5),y),fill="#172f43")
    def tr(self,label):
        return str(label[1 if self.lang=="en" else 0] if isinstance(label,(tuple,list)) else label)
    def face(self,size):
        return font(int(size)+(2 if self.large else 0))
    def panel(self,x,y,w,h,style="panel"):
        self.im.alpha_composite(sliced(style,int(w),int(h)),(int(x),int(y)))
    def icon(self,name,x,y):
        self.im.alpha_composite(sprite("icon-"+name),(int(x),int(y)))
    def text(self,x,y,label,size=12,color="ink",anchor="lt"):
        value=self.tr(label)
        if not value.strip():return
        f=self.face(size);d=ImageDraw.Draw(self.im)
        x,y=int(x),int(y)
        box=d.textbbox((x,y),value,font=f,anchor=anchor)
        self.bounds.append((value,box))
        if box[0]<-1 or box[1]<-1 or box[2]>self.w+1 or box[3]>self.h+1:self.warnings.append(("off-screen",value,box))
        if (size>=19 and color=="ink") or (size>=15 and color=="gold"):
            # The menu separates the five lettering inks. Re-render this bevel for each language.
            left,top,right,bottom=box
            mask=Image.new("L",(max(1,right-left),max(1,bottom-top)))
            ImageDraw.Draw(mask).text((x-left,y-top),value,font=f,anchor=anchor,fill=255)
            mask=mask.point(lambda alpha: 255 if alpha>=106 else 0)
            self.im.paste("#1d1312",(left+1,top+2,right+1,bottom+2),mask)
            self.im.paste("#8f4822",(left,top+1,right,bottom+1),mask)
            face=Image.new("RGB",mask.size,C["gold"])
            fd=ImageDraw.Draw(face)
            fd.rectangle((0,0,face.width,face.height//3),fill=C["ink"])
            fd.rectangle((0,face.height*4//5,face.width,face.height),fill=C["copper"])
            self.im.paste(face,(left,top),mask)
            return
        d.text((x,y+1),value,font=f,fill="#0a1523",anchor=anchor,stroke_width=0)
        d.text((x,y),value,font=f,fill=C.get(color,color),anchor=anchor)
    def wrap(self,x,y,w,label,size=12,color="ink"):
        line="";f=self.face(size);dy=f.size+4
        for word in self.tr(label).split():
            trial=(line+" "+word).strip()
            if line and f.getlength(trial)>w:
                self.text(x,y,line,size,color);y+=dy;line=word
            else:line=trial
        if line:self.text(x,y,line,size,color);y+=dy
        return y
    def button(self,x,y,w,h,label,style="secondary",icon=None):
        self.panel(x,y,w,h,style)
        inner_w=w-12-(20 if icon else 0)
        size=21 if style in ("primary","focus","pressed","hover") and h>=36 else 15 if h>=40 else 13
        value=self.tr(label)
        words=value.split()
        if h>=37 and len(words)>1 and self.face(min(size,14)).getlength(value)>inner_w:
            # Two optical lines keep long translated commands readable in adjacent slots.
            fs=min(size,14)
            candidates=[(" ".join(words[:i])," ".join(words[i:])) for i in range(1,len(words))]
            pair=min(candidates,key=lambda lines:max(self.face(fs).getlength(part) for part in lines))
            if max(self.face(fs).getlength(part) for part in pair)<=inner_w:
                cx=x+w//2+(9 if icon else 0);cy=y+h//2-1
                if icon:self.icon(icon,x+6,cy-8)
                for k,part in enumerate(pair):
                    self.text(cx,cy+(2*k-1)*(self.face(fs).size//2+1),part,fs,"muted" if style=="disabled" else "ink","mm")
                return
        while self.face(size).getlength(value)>inner_w and size>10:size-=1
        if value and self.face(size).getlength(value)>inner_w:self.warnings.append(("button-fit",value,(w,h,inner_w)))
        cx=x+w//2;cy=y+(h-2)//2+(2 if style=="pressed" else 0)
        if icon:
            left=cx-(self.face(size).getlength(value)+(20 if value else 16))//2
            if style=="disabled":
                tile=sprite("icon-"+icon)
                muted=ImageOps.colorize(tile.convert("L"),"#233a4c","#89969e").convert("RGBA")
                muted.putalpha(tile.getchannel("A"))
                self.im.alpha_composite(muted,(int(left),int(cy-8)))
            else:self.icon(icon,left,cy-8)
            if value:cx+=10
        if value:self.text(cx,cy,value,size,"muted" if style=="disabled" else "gold" if style in ("primary","pressed","focus","hover","selected") else "ink","mm")
    def hero(self,name,x,y,w,h,centering=(.5,.5)):
        art=ImageOps.fit(hero_image(name),(int(w),int(h)),method=N,centering=centering)
        self.im.alpha_composite(art,(int(x),int(y)))
    def meter(self,x,y,w,h,value,maximum,kind="health"):
        w,h=int(w),int(h)
        self.im.alpha_composite(sliced("meter",w,h,(3,3,3,3)),(int(x),int(y)))
        width=round((w-4)*min(1,max(0,value/max(1,maximum))))
        if width>0:self.im.alpha_composite(sprite("fill-"+kind).resize((width,max(1,h-4)),N),(int(x+2),int(y+2)))

if __name__=="__main__":export()

