"""Campaign catalogue, purchase inspector, prototype graph and the collection cabinet."""
import math
from PIL import Image,ImageDraw,ImageOps
import material as m
from material import *
from layout import shade

def cutaways():
    gen=Image.new("RGBA",(26,29));gd=ImageDraw.Draw(gen)
    gd.polygon([(1,20),(12,16),(24,20),(23,25),(13,28),(2,24)],fill="#34495a",outline=INK)
    gd.polygon([(2,19),(12,15),(24,19),(13,24)],fill="#74838b",outline="#a8a38f")
    gd.rectangle((8,9,17,20),fill="#3a5665",outline="#c59363")
    for q in (10,13,16):gd.line((7,q,18,q-1),fill="#8ea9b0",width=2)
    gd.polygon([(13,1),(17,6),(15,10),(11,11),(8,7)],fill="#91cfd1",outline="#436f8d")
    gd.line((11,6,13,3),fill="#d9e7d3");art("world-generator",gen,anchor=(13,26))
    # A cross-section of the beam optics engraved on its blue mounting plate.
    im=Image.new("RGBA",(100,84));d=ImageDraw.Draw(im)
    d.polygon([(10,64),(66,46),(91,55),(38,77)],fill="#17283c",outline="#7b8e96")
    d.polygon([(10,64),(38,77),(38,81),(10,68)],"#253e52")
    d.polygon([(38,77),(91,55),(91,59),(38,81)],"#102439")
    for x,y,r in [(29,54,18),(46,46,15),(64,37,13),(78,30,10)]:
        d.line((x+3,y+6,x+4,y+16),fill="#7d735f",width=3)
        d.ellipse((x-r//2-3,y-r,x+r//2+3,y+r),fill="#886948",outline="#e0b180",width=2)
        d.ellipse((x-r//2,y-r+3,x+r//2,y+r-3),fill="#376680",outline="#c6bda0")
        d.arc((x-r//2+2,y-r+5,x+r//2-1,y+r-5),160,290,fill="#94d4da",width=2)
    d.polygon([(19,63),(83,18),(89,15),(27,61)],fill="#c59a62")
    d.line((24,60,87,16),fill="#ffe2a7",width=2)
    art("object-optics",im,anchor=(50,77))
    src=m.SPRITES["object-cannon"].copy()
    d=ImageDraw.Draw(src);w,h=src.size
    d.polygon([(w//2-6,h//2),(w//2+1,h//2+1),(w//2-2,h//2+15),(w//2-5,h//2+13),(w//2-8,h//2+15)],"#925344")
    d.line((w//2-5,h//2+2,w//2-2,h//2+3),fill=IVORY)
    art("object-siege-cannon",src,anchor=(w//2,h-1))

def engraving(b,box,obj):
    x,y,w,h=box;b.box(box,"panel-inset")
    cx,cy=x+w//2,y+h//2
    rad=min(61,h//2-7,w//2-7);d=b.d
    for rr in (rad,rad-4,rad//2):
        if rr<2:continue
        d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),outline="#314e64")
    for a in range(0,360,15):
        co=math.cos(math.radians(a));si=math.sin(math.radians(a));n=6 if a%45==0 else 3
        d.line((round(cx+(rad-n)*co),round(cy+(rad-n)*si),round(cx+rad*co),round(cy+rad*si)),fill="#65818a")
    d.line((x+9,cy,x+w-10,cy),fill="#253e52")
    d.line((cx,y+8,cx,y+h-10),fill="#253e52")
    sp=m.SPRITES[obj]
    if h-12<sp.height:sp=ImageOps.contain(sp,(w-12,h-12),Image.Resampling.NEAREST)
    b.im.alpha_composite(sp,(cx-sp.width//2,cy-sp.height//2))

def catalogue(b):
    b.base(.84);b.head("Развитие кампании|Campaign upgrades","Маяк · 256 покупок|Lighthouse · 256 upgrades",back=False,mark="tree")
    groups=[("Все|All","book"),("Доступные|Available","check"),("Маяк|Lighthouse","beacon"),("Устройства|Devices","devices"),("Линзы|Lenses","lens"),("Способности|Abilities","flash")]
    if b.p:
        x=9;y=68;cw=(b.w-22)//2
        for i,(lab,ico) in enumerate(groups):
            c,r=i%2,i//2;b.btn((x+c*(cw+3),y+r*45,cw,41),lab,"tab",state="selected" if i==2 else "idle",size=10)
        lx,ly,lw,lh=8,208,b.w-16,365
    else:
        x=9;y=68;cw=max(104,int(b.w*.23))
        b.box((x,y,cw+8,232))
        for i,(lab,ico) in enumerate(groups):
            b.btn((x+6,y+7+i*36,cw-4,33),lab,"tab",ico,"selected" if i==2 else "idle",10)
        lx,ly,lw,lh=x+cw+14,y,b.w-cw-30,232
    b.box((lx,ly,lw,lh));x,y,w=lx+13,ly+9,lw-26
    b.title((x,y,w,34),"Свет|Light",20)
    b.icon("shard",x+w-88,y+5);b.text((x+w-66,y+10,64,18),"124",10,ink=MILK,align="right")
    b.line(x,y+38,w)
    rows=[("Мощность I|Power I","Куплено|Purchased","check"),("Мощность II|Power II","Урон луча 36 → 42 · 80 осколков|Beam damage 36 → 42 · 80 shards","rank"),("Связанный свет|Paired Light","Сначала купить Ширина I|Buy Width I first","lock")]
    for i,(name,desc,ico) in enumerate(rows):
        rh=71 if b.p else 48
        b.row((x,y+47+i*(rh+5),w,rh),name,desc,ico,i==1,False,"next" if i==1 else None)
    if b.p:b.text((x,y+298,w,47),"Маяк · Свет · 20 покупок|Lighthouse · Light · 20 upgrades",9,ink=MUTED)
    b.footer([("К подготовке|Preparation","quiet","back"),("Мощность II|Power II","primary","lens")])

def purchase(b,short=False):
    b.base(.82);b.head("Покупка|Purchase","Развитие кампании · Свет|Campaign upgrades · Light",back=False,mark="tree")
    if b.p:
        engraving(b,(9,72,b.w-18,162),"object-optics");bx,by,bw,bh=8,241,b.w-16,335
    else:
        lw=round(b.w*.36);engraving(b,(9,69,lw,226),"object-optics");bx,by,bw,bh=lw+15,69,b.w-lw-23,226
    b.box((bx,by,bw,bh));x,y,w=bx+14,by+9,bw-28
    b.title((x,y,w,32),"Мощность II|Power II",22)
    b.text((x,y+41,w,20),"Требование · Мощность I куплено|Requires Power I · Purchased",9,ink=TEAL,floor=8)
    b.line(x,y+66,w)
    b.text((x,y+81,w,18),"Урон луча за секунду|Beam damage per second",9,ink=MUTED)
    b.title((x,y+100,w,46),"36 → 42",23,ink=IVORY)
    b.icon("shard",x,y+156);b.text((x+24,y+158,w-25,19),"Цена 80 · В наличии 32|Price 80 · Balance 32" if short else "Цена 80 · В наличии 124|Price 80 · Balance 124",9,ink=MILK,floor=8)
    b.text((x,y+184,w,28),"Не хватает 48 осколков|Missing 48 shards" if short else "После покупки · 44 осколка|After purchase · 44 shards",8,ink=RED if short else MUTED)
    b.footer([("Назад|Back","quiet","back"),("Купить · 80|Buy · 80","primary","shard","disabled" if short else "idle")])

def tree(b):
    b.base(.89);b.head("Древо улучшений|Upgrade tree","Прототип · отдельное прохождение|Prototype · separate progress",mark="tree")
    x,y,w=9,69,b.w-18
    if b.p:
        b.btn((x,y,w,42),"Найти улучшение|Find upgrade","quiet","lens",size=11)
        b.btn((x,y+47,w,39),"Маяк · Все ветви|Lighthouse · All branches","tab",state="selected")
        gy=y+94;gh=332
    else:
        b.btn((x,y,176,40),"Маяк · Все ветви|Lighthouse · All branches","tab",state="selected",size=10)
        b.btn((x+181,y,w-181,40),"Найти улучшение|Find upgrade","quiet","lens",size=11)
        gy=y+46;gh=177
    b.box((x,gy,w,gh),"panel-inset")
    # A readable graph excerpt; coordinates are relative to the card, references
    # are the real dependencies of Power I/II, Width I/II and Paired Light.
    nx=[.1,.34,.72]
    pos={"root":(.10,.5),"p1":(.34,.24),"w1":(.34,.77),"p2":(.73,.17),"w2":(.73,.85),"pair":(.73,.49)}
    def xy(key):
        a,c=pos[key];return round(x+18+(w-57)*a),round(gy+20+(gh-53)*c)
    for a,z,stroke in [("root","p1",TEAL),("root","w1",TEAL),("p1","p2",COPPER),("w1","w2",STEEL),("p1","pair",STEEL),("w1","pair",STEEL)]:
        ax,ay=xy(a);zx,zy=xy(z);mid=(ax+zx)//2
        b.d.line([(ax+4,ay),(mid-5,ay),(mid+5,zy),(zx-4,zy)],fill=stroke,width=2)
    data=[("root","beacon","Маяк|Beacon"),("p1","complete","Мощность I|Power I"),("w1","open","Ширина I|Width I"),("p2","marked","Мощность II|Power II"),("w2","locked","Ширина II|Width II"),("pair","locked","Связанный свет|Paired Light")]
    for key,st,name in data:
        xx,yy=xy(key)
        if key=="root":b.icon("beacon",xx-10,yy-10)
        else:b.sprite("node-"+st,xx-9,yy-9)
        ww=min(119,round(w*.33))
        b.text((max(x+5,min(x+w-ww-5,xx-ww//2)),yy+12,ww,28),name,8,ink=IVORY if key=="p2" else MUTED,align="center",floor=7)
    if b.p:
        b.text((15,gy+gh+13,b.w-30,26),"Изучено · Доступно · Закрыто|Learned · Available · Locked",8,ink=MUTED,align="center")
    b.footer([("Обзор|Overview","quiet","map"),("−  100%  +","quiet"),("Мощность II|Power II","primary")])

def collection(b):
    b.base(.83);b.head("Коллекция|Collection","Награды кампании|Campaign rewards",back=False,mark="collection")
    names=[("Осадная пушка|Siege cannon","flag"),("Дальний гарпун|Long-range harpoon","lock"),
           ("Лунный луч|Moonbeam","check"),("Бронзовые устройства|Bronze devices","lock"),("Маяк рассвета|Dawn beacon","lock")]
    if b.p:
        bx,by,bw,bh=8,70,b.w-16,287
        lx,ly,lw,lh=8,365,b.w-16,206
    else:
        lw=round(b.w*.40);lx,ly,lh=8,70,227;bx,by,bw,bh=lw+14,70,b.w-lw-22,227
    b.box((bx,by,bw,bh))
    x,y,w=bx+12,by+10,bw-24
    eh=93 if not b.p else 121
    engraving(b,(x,y,w,eh),"object-siege-cannon")
    b.title((x,y+eh+3,w,30),"Осадная пушка|Siege cannon",17,floor=14)
    b.text((x,y+eh+40,w,47),"Урон +25% · Интервал между выстрелами +25%.|Damage +25% · Time between shots +25%.",9,ink=MILK,floor=8)
    b.text((x,y+eh+89,w,bh-(eh+103)),"Победа · Осадный обоз|Victory · Siege Convoy",8,ink=TEAL,floor=7)
    b.box((lx,ly,lw,lh),"panel-inset")
    for i,(label,icon) in enumerate(names):
        rh=34 if b.p else 38
        b.row((lx+7,ly+6+i*(rh+3),lw-14,rh),label,icon=icon,selected=i==0)
    b.footer([("Назад|Back","quiet","back"),("Забрать награду|Claim reward","primary","collection")])
