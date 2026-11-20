"""Native board painter, layout bounds and independent draw-time text measurements."""
from functools import lru_cache
from PIL import Image,ImageDraw,ImageOps
from lettering import width,wrap,mask_of,write_line
import material as m
from material import INK,NAVY,DEEP,COPPER,GOLD,IVORY,PAPER,MILK,MUTED,STEEL,TEAL,RED,PARCH_INK,PARCH_SUB

DEVICES={
    "desktop":((1280,720),(640,360),2.0),
    "phone-landscape":((844,390),(779,360),390/360),
    "phone-portrait":((390,844),(296,640),844/640),
}
@lru_cache(maxsize=8)
def scenery(w,h):
    ref=Image.open(m.MASTERS/"menu/background.png").convert("RGBA")
    for name,rect in [("moon",(514,128,64,64)),("ship",(500,318,64,64)),("sail",(500,318,64,64))]:
        x,y,rw,rh=rect; src=Image.open(m.MASTERS/f"menu/{name}.png").convert("RGBA").crop((0,0,rw,rh))
        ref.alpha_composite(src,(x,y))
    if h>w:
        scale=h/640;left=max(w-640*scale,min(0,min((w-360*scale)/2-220*scale,w-580*scale)))
        box=(-left/scale,0,(w-left)/scale,h/scale)
    else:
        scale=max(w/640,h/360);left=max(w-640*scale,min(0,min((w-640*scale)/2,w-580*scale)))
        top=max(100,min(120,384-h/scale));box=(-left/scale,top,(w-left)/scale,top+h/scale)
    return ref.resize((w,h),Image.Resampling.NEAREST,box=tuple(min(640,max(0,v)) for v in box))

def shade(im,amount=0.6,color="#071a30"):
    return Image.blend(im.convert("RGBA"),Image.new("RGBA",im.size,color),amount)

def portrait_paint(im,box,index):
    x,y,w,h=box
    im.alpha_composite(m.sliced("panel-picture",(w,h)),(x,y))
    pic=ImageOps.fit(m.PLATES[index],(w-8,h-8),method=Image.Resampling.NEAREST)
    im.paste(pic,(x+4,y+4))

class Board:
    def __init__(self,device,lang,large,scene):
        self.device=device;self.target,self.size,self.scale=DEVICES[device];self.w,self.h=self.size
        self.p=self.h>self.w;self.lang=lang;self.large=large;self.scene=scene
        self.im=Image.new("RGBA",self.size,INK);self.d=ImageDraw.Draw(self.im)
        self.textlog=[];self.hit=[];self.notes=[];self.tags=[]
    def loc(self,s):
        if isinstance(s,(tuple,list)):return s[1 if self.lang=="en" else 0]
        return s.split("|")[1 if self.lang=="en" else 0] if "|" in s else s
    def base(self,level=.74):
        self.im.paste(shade(scenery(self.w,self.h),level))
    def box(self,box,kind="panel-stone"):
        x,y,w,h=map(round,box)
        self.im.alpha_composite(m.sliced(kind,(w,h)),(x,y))
    def sprite(self,name,x,y):
        self.im.alpha_composite(m.SPRITES[name],(round(x),round(y)))
    def icon(self,name,x,y):
        self.sprite("icon-"+name,x,y)
    def picture(self,box,i):
        portrait_paint(self.im,tuple(map(round,box)),i)
    def line(self,x,y,w,light=False):
        self.d.line((x,y,x+w-1,y),fill="#9f7c58" if light else "#526276")
        self.d.point((x+w-2,y),fill="#d3a472" if light else "#7d8584")
    def text(self,box,s,size=9,style="body",ink=MILK,align="left",vertical="top",relief=False,
             floor=None,limit=None,verbatim=False):
        x,y,w,h=(int(k) for k in box);s=self.loc(s) if not verbatim else s
        if not s:return 0
        # Large preference is dynamic, including body, title and action labels.
        requested=size+(max(1,round(size*.18)) if self.large else 0)
        floor=requested if floor is None else floor+(max(1,round(floor*.13)) if self.large else 0)
        for point in range(requested,floor-1,-1):
            lines=wrap(s,w-2,point,style)
            pitch=round(point*1.48)+1 if style=="body" else round(point*1.34)+2
            boxlist=[mask_of(a,point,style).getbbox() or (0,0,0,0) for a in lines]
            if not all(width(a,point,style)<=w-2 for a in lines):continue
            ascent=0 if vertical=="top" else boxlist[0][1]
            block=(len(lines)-1)*pitch+boxlist[-1][3]-ascent+(2 if relief else 0)
            if block<=h and (limit is None or len(lines)<=limit):break
        else:
            raise ValueError(f"{self.scene}/{self.device}/{self.lang}/large={self.large}: text overflow {box}, {style} {requested}…{floor}: {s!r}")
        y0=y-((boxlist[0][1]) if vertical=="middle" else 0)
        if vertical=="middle":y0+=max(0,(h-block)//2)
        elif vertical=="bottom":y0+=h-block
        for i,line in enumerate(lines):
            lw=width(line,point,style)
            tx=x+(0 if align=="left" else (w-lw)//2 if align=="center" else w-lw-1)
            if line:
                bb=write_line(self.im,line,tx,y0+i*pitch,point,style,ink,relief)
                if bb:
                    px=(tx+bb[0],y0+i*pitch+bb[1],tx+bb[2]+int(relief),y0+i*pitch+bb[3]+2*int(relief))
                    if px[0]<x or px[1]<y or px[2]>x+w or px[3]>y+h or px[0]<0 or px[1]<0 or px[2]>self.w or px[3]>self.h:
                        raise ValueError(f"{self.scene}: clipped {line} {px} vs {box}")
        self.textlog.append({"text":s,"box":[x,y,w,h],"size":point,"lines":len(lines),"style":style})
        return block
    def title(self,b,s,size=21,align="left",ink=GOLD,floor=None):
        return self.text(b,s,size,"display",ink,align,"middle",ink==GOLD,floor if floor is not None else size-2)
    def btn(self,b,s,kind="quiet",icon=None,state="idle",size=11,align="center"):
        x,y,w,h=b
        key="tab-"+state if kind=="tab" else "button-"+kind+"-"+state
        self.box(b,key)
        self.hit.append({"action":self.loc(s) or icon,"rect":list(b),"state":state,"sprite":key})
        if not s:
            self.icon(icon,x+(w-20)//2,y+(h-20)//2);return
        if icon:
            self.icon(icon,x+7,y+(h-20)//2)
        pad=7; labelx=x+(30 if icon else pad); labelw=w-(30 if icon else pad)-pad
        tint = "#9daeb8" if state=="disabled" else GOLD if kind=="primary" else MILK
        compact=labelw<95 and kind in ("quiet","tab")
        style="body" if compact else "display"
        font_size=min(9,size) if compact else size
        self.text((labelx,y+3+(2 if state=="pressed" else 0),labelw,h-8),s,font_size,style,tint,align,"middle",kind=="primary" and state!="disabled",max(8,font_size-2))
    def head(self,s,sub=None,back=True,mark=None):
        """Quiet fixed header for pages; its back control always has the same footprint."""
        w=self.w;h=56
        self.box((7,5,w-14,h),"panel-stone")
        x=19
        if back:self.btn((13,11,42,42),"",icon="back");x=64
        if mark and not self.p:
            self.icon(mark,w-42,21)
        avail=w-x-(51 if mark and not self.p else 14)
        if sub:
            self.text((x,9,avail,14),sub,7,"body",MUTED,floor=7)
            self.title((x,22,avail,34),s,19,floor=11)
        else:self.title((x,9,avail,44),s,21,floor=16)
    def footer(self,actions,y=None):
        # Actions are (label, type, [icon], [state]); wider labels take more room.
        y=self.h-49 if y is None else y
        gap=5; left=8; available=self.w-16
        # Distribute from the actual language and the longest indivisible word.
        # On the narrow board a text label takes precedence over an adjacent icon.
        if self.p and len(actions)>1:
            actions=[(a[0],a[1],None,*a[3:]) for a in actions]
        weights=[max(50,max(width(t,11+int(self.large),"display") for t in self.loc(a[0]).split())+16+
                     (22 if len(a)>2 and a[2] else 0)) for a in actions]
        room=available-gap*(len(actions)-1)
        widths=[max(42,round(room*f/sum(weights))) for f in weights]
        widths[-1]+=room-sum(widths)
        for action,bw in zip(actions,widths):
            label,kind,*opts=action;ico=opts[0] if opts else None
            state=opts[1] if len(opts)>1 else "idle"
            self.btn((left,y,bw,42),label,kind,ico,state);left+=bw+gap
    def wallet(self,x,y):
        self.icon("shard",x,y);self.text((x+22,y+2,40,15),"124",10,ink=MILK)
        self.icon("pearl",x+58,y);self.text((x+80,y+2,21,15),"2",10,ink=MILK)
    def row(self,b,title,desc=None,icon=None,selected=False,paper=False,tail=None):
        x,y,w,h=b
        self.box(b,("panel-page-selected" if selected else "panel-page-row") if paper else ("button-primary-idle" if selected else "panel-slate"))
        left=10
        if icon:
            self.icon(icon,x+6,y+(h-20)//2);left=30
        right=10
        if tail:
            self.icon(tail,x+w-26,y+(h-20)//2);right=31
        color=PARCH_INK if paper else MILK
        if desc:
            self.text((x+left,y+3,w-left-right,h//2),title,11,"display",color,vertical="middle",floor=9)
            self.text((x+left,y+h//2,w-left-right,h-h//2-4),desc,8,ink=PARCH_SUB if paper else MUTED,vertical="middle",floor=7)
        else:self.text((x+left,y+2,w-left-right,h-5),title,12,"display",color,vertical="middle",floor=9)
    def finish(self):
        # One isotropic optical scale. Centring accounts only for the fractional
        # logical column left by a CSS viewport of 844 or 390 pixels.
        u=1/self.scale
        dx=(self.w-self.target[0]*u)/2
        dy=(self.h-self.target[1]*u)/2
        return self.im.convert("RGB").transform(self.target,Image.Transform.AFFINE,
            (u,0,dx,0,u,dy),resample=Image.Resampling.NEAREST)
