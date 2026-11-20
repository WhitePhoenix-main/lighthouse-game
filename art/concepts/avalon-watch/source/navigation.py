"""Navigation folios, the optics bench and the keeper's cabinet at native pixel scale."""
from functools import lru_cache
from math import cos, sin, pi
from pathlib import Path
from random import Random
from PIL import Image, ImageDraw
from kit import C, ROOT, N, bevel

SCREENS = {
    "chronicle": "Хроника · выбор ночи", "chronicle-chapters": "Хроника · оглавление",
    "trials": "Испытания прототипа · доступно", "trials-locked": "Испытания прототипа · закрыто",
    "upgrades": "Древо · доступная покупка", "upgrades-locked": "Древо · требования",
    "collection": "Коллекция · получение", "collection-equipped": "Коллекция · оформление",
    "reward-offer": "Добровольная награда · основной запуск", "reward-test": "Добровольная награда · тестовое подтверждение",
}

NAV = ROOT / "sprites" / "navigation"
PAPER_INK = "#433324"
FADED_INK = "#69523c"
PAPER_LIGHT = "#ead8ac"
TITLES = [("Туманный берег","Misty Shore"),("Дальний берег","Far Shore"),("Терновые топи","Thorn Marsh"),
          ("Пепельные утёсы","Ashen Cliffs"),("Кладбище кораблей","Ship Graveyard"),
          ("Затмение Авалона","Avalon Eclipse"),("Последний рассвет","Last Dawn")]
NIGHTS = [("Первый свет","First Light"),("Разбитый берег","Broken Shore"),("Крылатый прилив","Winged Tide"),("Обратный прилив","Turning Tide")]
TRIALS = [("Сигнал бедствия","Distress Signal"),("Броневой фронт","Armored Front"),("Воздушный налёт","Air Raid"),("Смешанный штурм","Combined Assault")]
BACK = ("Назад","Back")
PREP = ("К подготовке","To preparation")


def lettering(ui,x,y,label,size,colour=PAPER_INK,anchor="lt"):
    value=ui.tr(label)
    d=ImageDraw.Draw(ui.im)
    box=d.textbbox((x,y),value,font=ui.face(size),anchor=anchor)
    ui.bounds.append((value,box))
    if box[0]<0 or box[1]<0 or box[2]>ui.w or box[3]>ui.h:
        ui.warnings.append(("off-screen",value,box))
    d.text((x,y),value,font=ui.face(size),fill=colour,anchor=anchor)


def lines(ui,x,y,w,label,size=12,colour=PAPER_INK):
    current=""
    for word in ui.tr(label).split():
        test=(current+" "+word).strip()
        if current and ui.face(size).getlength(test)>w:
            lettering(ui,x,y,current,size,colour)
            y+=ui.face(size).size+3
            current=word
        else:
            current=test
    if current:
        lettering(ui,x,y,current,size,colour)
        y+=ui.face(size).size+3
    return y


def rail(d,x,y,w):
    d.line((x,y,x+w-1,y),fill="#ad7951")
    d.line((x+2,y+1,x+w-3,y+1),fill="#603c2c")
    for xx in (x+2,x+w-5):
        d.rectangle((xx,y-1,xx+2,y+2),fill="#bc8051")
        d.point((xx,y-1),fill="#ffe6a7")


def phone(ui):
    # Desktop is authored at 640 x 360 and displayed at 2x.
    return ui.p or ui.w==720


def heading(ui,title,tag=None):
    back=(5,0,44,44) if phone(ui) else (8,6,37,34)
    ui.button(*back,"","secondary","back")
    ui.text(55,10,title,20,"gold")
    if tag:
        ui.text(ui.w-13,18,tag,11,"muted","rt")
    rail(ImageDraw.Draw(ui.im),8,43,ui.w-16)


def scrollpaper(ui,x,y,w,h,seed=12,bleach=0):
    d=ImageDraw.Draw(ui.im)
    # Thumbed leaf edges step down to a darker signature underneath.
    d.rectangle((x+3,y+4,x+w+1,y+h+1),fill="#171b1e")
    d.rectangle((x,y+2,x+w-1,y+h-1),fill="#81664c")
    d.rectangle((x+1,y+1,x+w-2,y+h-3),fill="#b89a70")
    d.rectangle((x+2,y,x+w-3,y+h-5),fill="#d8c096")
    for xx in range(w-6):
        edge=min(1,(xx+1)/14,(w-6-xx)/11)
        light=(edge-1)*24+bleach
        col=tuple(max(0,min(255,round(t+light))) for t in (220,200,162))
        d.line((x+3+xx,y+2,x+3+xx,y+h-7),fill=col)
    rng=Random(seed)
    for _ in range(w*h//96):
        xx=x+rng.randint(3,w-6); yy=y+rng.randint(2,h-8)
        col=rng.choice(("#d1bb96","#d9c3a0","#e2cca4"))
        d.line((xx,yy,min(x+w-6,xx+rng.randrange(1,4)),yy),fill=col)
    for yy in (y+1,y+h-6):
        d.line((x+4,yy,x+w-6,yy),fill="#ead5ab")
    for xx in (x+7,x+w-10):
        d.point((xx,y+6),fill="#9d7852")


def wood(ui,x,y,w,h):
    d=ImageDraw.Draw(ui.im)
    rng=Random(771)
    d.rectangle((x,y,x+w-1,y+h-1),fill="#1a171b")
    for i,yy in enumerate(range(y+3,y+h,22)):
        yb=min(y+h-1,yy+19)
        d.rectangle((x+1,yy,x+w-2,yb),fill=("#493830","#49362c","#40322c","#49382e")[i%4])
        d.line((x+2,yy,x+w-3,yy),fill="#75553d")
        for _ in range(w//8):
            xx=x+rng.randrange(2,w-4)
            yg=rng.randint(yy,yb)
            d.line((xx,yg,min(x+w-3,xx+rng.randint(3,27)),yg),fill=rng.choice(("#503c31","#594231","#3c302a")))
    for xx in (x+3,x+w-9):
        d.rectangle((xx,y+2,xx+5,y+h-3),fill="#28323a")
        d.line((xx,y+2,xx,y+h-3),fill="#69605a")
        for yy in range(y+8,y+h-4,47):
            d.rectangle((xx+1,yy,xx+3,yy+3),fill="#936949")
            d.point((xx+1,yy),fill="#eed19a")


def pin(d,x,y):
    d.ellipse((x-4,y-2,x+4,y+5), fill="#584333")
    d.ellipse((x-4,y-4,x+3,y+2),fill="#9a643d")
    d.line((x-2,y-3,x+1,y-3),fill="#ffe3a4")
    d.line((x-1,y,x+1,y-2),fill="#614630")


def seal(ui,x,y,available):
    d=ImageDraw.Draw(ui.im)
    d.polygon([(x-6,y+7),(x+1,y+9),(x-2,y+24),(x-5,y+18),(x-11,y+20)],fill="#803c32")
    d.polygon([(x+1,y+8),(x+8,y+6),(x+12,y+20),(x+6,y+17),(x+4,y+21)],fill="#ab5540")
    d.ellipse((x-13,y-11,x+14,y+15),fill="#74523d")
    d.regular_polygon((x,y,14),12,15,fill="#8c4738")
    d.ellipse((x-11,y-11,x+11,y+11),outline="#d99964",width=2)
    d.ellipse((x-8,y-8,x+8,y+8),outline="#703a30")
    ui.icon("check" if available else "lock",x-8,y-8)


def book(ui):
    d=ImageDraw.Draw(ui.im)
    x=11; y=55; w=ui.w-22; h=ui.h-64
    bevel(d,x,y,x+w-1,y+h-1,7,"#070f19")
    bevel(d,x+2,y+1,x+w-3,y+h-5,6,"#63412f")
    bevel(d,x+3,y+1,x+w-4,y+h-7,6,"#536177")
    bevel(d,x+5,y+3,x+w-6,y+h-9,6,"#253953")
    if ui.p:
        scrollpaper(ui,x+12,y+7,w-21,h-20)
        d.rectangle((x+6,y+10,x+11,y+h-19),fill="#30262a")
        for yy in (y+28,y+h-37): d.rectangle((x+4,yy,x+12,yy+4),fill="#a7774f")
        return (x+23,y+14,w-43,0),(x+23,y+237,w-43,ui.h-y-259)
    center=round(w*.44)+x
    scrollpaper(ui,x+8,y+6,center-x-12,h-18)
    scrollpaper(ui,center+5,y+6,x+w-center-14,h-18,19,2)
    d.rectangle((center-4,y+6,center+4,y+h-16),fill="#302829")
    for yy in (y+23,y+h-32):
        d.rectangle((center-5,yy,center+4,yy+5),fill="#855a40")
        d.line((center-5,yy,center+4,yy),fill="#ca9561")
    return (x+21,y+16,center-x-41,h-40),(center+18,y+16,x+w-center-41,h-40)


def chapter_row(ui,x,y,w,h,i,chapters,active):
    d=ImageDraw.Draw(ui.im)
    locked=i>0 if chapters else i>2
    if active:
        d.rectangle((x-3,y,x+w+1,y+h-2),fill="#936539")
        d.rectangle((x-2,y+1,x+w,y+h-3),fill="#eed4a0")
        d.rectangle((x-3,y,x,y+h-2),fill="#a76437")
    else:
        d.line((x+1,y+h-3,x+w-2,y+h-3),fill="#b69b76")
    mid=y+h//2-1
    lettering(ui,x+9,mid,("I","II","III","IV","V","VI","VII")[i],12,FADED_INK,"lm")
    lettering(ui,x+40,mid,(TITLES if chapters else NIGHTS)[i],12,PAPER_INK,"lm")
    status="lock" if locked else "check" if (i<2 and not chapters) else "book"
    # Small dark inlaid studs keep pale icons legible against the paper.
    d.ellipse((x+w-23,mid-9,x+w-5,mid+9),fill="#514c40")
    ui.icon(status,x+w-22,mid-8)


def chronicle(ui,chapters):
    heading(ui,("Хроника маяка","Lighthouse Chronicle"))
    left,right=book(ui)
    x,y,w,h=left
    touch=phone(ui)
    tab_h=44 if touch else 27
    for i,(label,sel) in enumerate([(("Главы","Chapters"),chapters),(("Ночи","Nights"),not chapters)]):
        bw=(w-3)//2
        ui.button(x+i*(bw+3),y,bw,tab_h,label,"selected" if sel else "tab")
    iy=y+tab_h+(2 if touch else 8)
    if not chapters and not touch:
        lettering(ui,x+2,iy+2,("I · Туманный берег","I · Misty Shore"),16)
        iy+=32
    count=4 if touch or not chapters else 7
    row_h=44 if touch else (28 if chapters else 32)
    for i in range(count):
        chapter_row(ui,x,iy+i*row_h,w,row_h,i,chapters,i==(1 if chapters else 2))
    if touch or not chapters:
        py=iy+row_h*count+(2 if touch else 6)
        aw,ah=(44,44) if touch else (30,25)
        for bx,direction in ((x,-1),(x+w-aw,1)):
            ui.button(bx,py,aw,ah,"","disabled" if direction<0 else "secondary")
            cx=bx+aw//2; cy=py+(ah-2)//2
            d=ImageDraw.Draw(ui.im)
            d.line((cx-3*direction,cy-5,cx+2*direction,cy,cx-3*direction,cy+5),
                   fill="#768b92" if direction<0 else C["gold"],width=2)
        page=("Главы 1–4 / 7","Chapters 1–4 / 7") if chapters else ("Лист 1 / 2","Leaf 1 / 2")
        lettering(ui,x+w//2,py+ah//2,page,12,FADED_INK,"mm")
    x,y,w,h=right
    if ui.p:
        y=357
        ImageDraw.Draw(ui.im).line((x-3,y-6,x+w+3,y-6),fill="#9d805f")
    hero_h=96 if ui.p else 101
    bevel(ImageDraw.Draw(ui.im),x-2,y-2,x+w+1,y+hero_h+1,2,"#916d4f")
    ui.hero("archive" if chapters else "harbor",x,y,w,hero_h)
    y+=hero_h+8
    meta=("Глава II · 7 ночей","Chapter II · 7 nights") if chapters else (
        ("Туманный берег · Ночь 3 · 4 волны","Misty Shore · Night 3 · 4 waves") if touch else ("Ночь 3 · 4 волны","Night 3 · 4 waves"))
    lettering(ui,x,y,meta,11,FADED_INK)
    y+=19
    lettering(ui,x,y,TITLES[1] if chapters else NIGHTS[2],20)
    y+=30
    desc=(("Откроется после победы в ночи «Страж глубин».","Opens after victory in Abyss Warden.") if chapters else
          ("Летучие мыши атакуют устройства с воды. Пушка не достаёт летающих.","Bats attack devices from the water. Cannons cannot hit flying targets."))
    lines(ui,x,y,w,desc,12)
    action_h=44 if touch else 36
    if chapters:
        ui.button(x,ui.h-30-action_h,w,action_h,("Осмотреть ночи","Inspect nights"),"secondary","book")
    else:
        replay=("Смотреть вступление","Watch the introduction")
        if touch:
            # The secondary action wraps before the primary action loses its text size.
            rw=(w-4)//2; py=ui.h-30-action_h
            if ui.face(13).getlength(ui.tr(replay))<=rw-12:
                ui.button(x,py,rw,action_h,replay)
            else:
                ui.button(x,py,rw,action_h,"")
                for line_no,line in enumerate([("Смотреть","Watch the"),("вступление","introduction")]):
                    ui.text(x+rw//2,py+12+line_no*17,line,13,"ink","mm")
            ui.button(x+rw+4,py,w-rw-4,action_h,PREP,"primary")
        else:
            lx,ly,lw,lh=left
            ui.button(lx,ui.h-63,lw,31,replay,"secondary","book")
            ui.button(x,ui.h-30-action_h,w,action_h,PREP,"primary","play")


def trials(ui,locked):
    heading(ui,("Испытания","Trials"),("Прототип","Prototype"))
    wood(ui,7,53,ui.w-14,ui.h-61)
    if ui.p:
        lx,ly,lw=28,68,ui.w-56
        rx,ry,rw,rh=25,261,ui.w-50,ui.h-281
        stride=44
    else:
        lx,ly,lw=29,70,int(ui.w*.39)-26
        rx,ry,rw,rh=lx+lw+23,67,ui.w-lx-lw-49,ui.h-86
        stride=63
    for i,name in enumerate(TRIALS):
        selected=(i==(1 if locked else 0))
        ex=lx+(-3 if selected else 3+(i%2)*3)
        ey=ly+i*stride
        eh=44 if ui.p else 50
        scrollpaper(ui,ex,ey,lw,eh,40+i,4 if selected else -10)
        pin(ImageDraw.Draw(ui.im),ex+12,ey+8)
        if selected:
            ImageDraw.Draw(ui.im).rectangle((ex+2,ey+16,ex+5,ey+eh-8),fill="#9d502d")
        lettering(ui,ex+25,ey+eh//2-2,name,14,PAPER_INK,"lm")
        if i: 
            d=ImageDraw.Draw(ui.im)
            d.ellipse((ex+lw-27,ey+eh//2-12,ex+lw-7,ey+eh//2+8),fill="#635a49")
            ui.icon("lock",ex+lw-25,ey+eh//2-10)
    scrollpaper(ui,rx,ry,rw,rh,20,4)
    x,y,w=rx+14,ry+12,rw-29
    hero_h=113 if ui.p else 68
    ui.hero("storm" if locked else "harbor",x,y,w,hero_h)
    seal(ui,x+w-20,y+hero_h-5,not locked)
    y+=hero_h+11
    lettering(ui,x,y,("Закрыто","Locked") if locked else ("Доступно","Available"),11,FADED_INK)
    y+=18
    lettering(ui,x,y,TRIALS[1 if locked else 0],19)
    y+=31
    body=(("Панцирные черепахи с 840 брони. Используйте бронебойность.","Shellback turtles have 840 armor. Use armor piercing.") if locked else
          ("Держите корабль в луче 6 с, пока не истекли 24 с.","Keep the ship in the beam for 6 s before the 24 s deadline."))
    y=lines(ui,x,y,w,body,13)+5
    lines(ui,x,y,w,("Требуется победа в ночи «Дальний берег».","Win Far Shore to unlock.") if locked else
          ("Спасение корабля: +12 осколков.","Ship rescue: +12 shards."),12,FADED_INK)
    action_h=44 if phone(ui) else 36
    ui.button(x,ry+rh-14-action_h,w,action_h,("Закрыто","Locked") if locked else PREP,"disabled" if locked else "primary","lock" if locked else "play")

def specimen(name):
    """Museum-scale models, drawn on 64 x 48 grids, with a shared light from upper left."""
    im=Image.new("RGBA",(64,48))
    d=ImageDraw.Draw(im)
    shadow="#15212c"; deep="#324556"; steel="#658593"; glare="#b7d5ce"
    brown="#653b29"; brass="#bc7840"; rim="#edaf60"; shine="#ffe6a3"
    def poly(points,fill,edge=shadow):
        d.polygon(points,fill=fill,outline=edge)
    def stroke(points,fill,width=1): d.line(points,fill=fill,width=width)
    def bar(box,fill,highlight):
        d.rectangle(box,fill=fill,outline=shadow)
        x,y,r,_=box;d.line((x+1,y+1,r-1,y+1),fill=highlight)
    def wheel(cx,cy,r):
        d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=brown,outline=shadow,width=2)
        d.ellipse((cx-r+2,cy-r+2,cx+r-2,cy+r-2),fill=deep,outline=rim)
        for i in range(8):
            a=i*pi/4
            stroke([(cx,cy),(cx+round((r-2)*cos(a)),cy+round((r-2)*sin(a)))],brass)
        d.ellipse((cx-2,cy-2,cx+2,cy+2),fill=shine,outline=brown)
    def lens(cx,cy,r):
        for rad,c in [(r,shadow),(r-1,brass),(r-3,rim),(r-4,deep),(r-5,steel),(r-7,glare)]:
            if rad<=0: continue
            d.ellipse((cx-rad,cy-rad,cx+rad,cy+rad),fill=c)
        stroke([(cx-r+5,cy-1),(cx-r+8,cy-5),(cx-2,cy-7)],"#f0f0cb",2)
        stroke([(cx+1,cy+5),(cx+4,cy+3)],"#699b9f",2)
    if name=="dawn-beacon":
        poly([(11,43),(16,38),(24,36),(26,30),(42,31),(44,38),(53,42),(55,45),(10,45)],deep)
        poly([(22,39),(27,19),(39,18),(43,39),(37,42),(27,42)],"#ad7750")
        poly([(24,38),(27,21),(32,20),(30,40)],"#d1a366")
        poly([(37,20),(40,24),(43,39),(38,41)],"#77513b")
        for yy in (23,29,35,39):
            stroke([(26-(yy-23)//6,yy),(37,yy+1),(39+(yy-23)//6,yy)],brown)
            stroke([(28+(yy%3)*2,yy+1),(27+(yy%3)*2,yy+4)],"#835f46")
        d.rectangle((29,34,32,40),fill=brown)
        d.rectangle((32,25,34,28),fill=deep);d.point((33,26),fill=rim)
        bar((22,17,43,20),brass,shine)
        d.rectangle((25,9,40,16),fill=brown)
        for xx in (26,31,36):
            d.rectangle((xx,10,xx+2,15),fill=rim);d.line((xx,10,xx,13),fill=shine)
        poly([(22,9),(29,5),(32,1),(34,5),(42,9)],brass)
        stroke([(24,8),(31,5),(32,3)],rim)
        for xx in (23,28,38,42):stroke([(xx,16),(xx,20)],steel)
        stroke([(22,16),(43,16)],rim)
    elif name=="siege-cannon":
        poly([(8,39),(20,27),(35,27),(44,38),(55,40),(55,43),(39,42),(29,35),(14,44)],brass)
        wheel(28,35,9)
        poly([(8,24),(13,21),(14,18),(48,6),(52,16),(17,29),(11,30)],steel)
        stroke([(13,23),(47,10)],glare,2)
        d.ellipse((45,5,56,18),fill=brass,outline=shadow,width=2)
        d.ellipse((47,7,54,16),fill=deep,outline=rim)
        for xx,yy in [(18,18),(33,13)]:
            poly([(xx,yy),(xx+3,yy-1),(xx+7,yy+9),(xx+4,yy+10)],brass)
            stroke([(xx+1,yy),(xx+3,yy+4)],shine)
        wheel(20,36,8)
    elif name=="long-harpoon":
        bar((11,39,47,42),deep,steel)
        poly([(18,39),(28,28),(34,28),(39,39),(34,40),(29,34),(24,40)],brass)
        poly([(10,33),(39,16),(42,20),(17,37)],brown)
        stroke([(11,32),(42,14)],steel,4)
        stroke([(12,31),(54,7)],glare)
        poly([(45,8),(59,3),(54,13),(54,8),(47,13)],glare)
        stroke([(20,22),(23,25),(36,34),(39,32)],brass,2)
        stroke([(20,22),(15,31),(37,34)],steel)
        wheel(27,31,6)
    elif name=="bronze-devices":
        poly([(6,37),(16,29),(29,30),(35,40),(17,45),(7,42)],deep)
        poly([(9,35),(13,23),(17,18),(25,20),(29,32),(25,37),(17,40)],brass)
        bar((13,20,26,23),brown,rim)
        for xx in (14,18,22):d.rectangle((xx,25,xx+2,31),fill=shine,outline=brown)
        poly([(30,34),(33,17),(40,11),(50,16),(55,34),(51,39),(38,40)],brass)
        poly([(30,34),(33,17),(39,20),(37,37)],"#e3a55b")
        poly([(39,20),(49,16),(53,33),(44,37),(37,37)],"#9b6139")
        for yy in (21,26,31):stroke([(40,yy),(47,yy-3)],rim,2)
        wheel(46,34,8)
    elif name=="moonbeam":
        # A crescent aperture suspended above a silver-blue ribbon of light.
        poly([(7,37),(38,21),(52,18),(54,24),(26,38),(12,41)],"#527887")
        stroke([(8,38),(32,27),(50,19)],"#a3d3da",2)
        stroke([(21,41),(51,24)],"#7498ad")
        d.ellipse((28,2,55,29),fill="#c7d5cb",outline=shadow)
        # Cut the aperture before laying the suspension ring.
        d.ellipse((37,-2,61,23),fill=(0,0,0,0))
        stroke([(30,12),(30,18),(34,23),(41,26),(49,26)],"#849fa5",2)
        d.arc((24,1,59,34),-48,164,fill=brass,width=2)
        for xx,yy in [(16,19),(21,12),(49,10)]:
            stroke([(xx-2,yy),(xx+2,yy)],glare);stroke([(xx,yy-2),(xx,yy+2)],glare)
    elif name in ("optic","paired-optic"):
        poly([(8,30),(16,22),(41,14),(54,18),(47,26),(18,37)],brass)
        poly([(12,32),(19,29),(22,34),(16,37)],rim)
        if name=="paired-optic":
            lens(23,30,10);lens(41,16,11)
        else:
            lens(36,23,16)
            stroke([(21,34),(17,40),(21,42),(27,37)],brass,3)
        for xx,yy in [(10,16),(53,29),(16,10)]:
            d.point((xx,yy),fill=rim)
    else: raise KeyError(name)
    return im


ITEMS=("siege-cannon","long-harpoon","dawn-beacon","bronze-devices","moonbeam")
ITEM_NAMES=(("Осадная пушка","Siege cannon"),("Дальний гарпун","Long-range harpoon"),
            ("Маяк рассвета","Dawn beacon"),("Бронзовые устройства","Bronze devices"),("Лунный луч","Moonbeam"))


def export():
    NAV.mkdir(parents=True,exist_ok=True)
    for name in (*ITEMS,"optic","paired-optic"):
        specimen(name).save(NAV/(name+".png"))


@lru_cache(maxsize=40)
def specimen_frame(name,w,h):
    im=Image.open(NAV/(name+".png")).convert("RGBA")
    return im.resize((w,h),N)


def show_specimen(ui,name,cx,cy,w):
    h=round(w*3/4)
    ui.im.alpha_composite(specimen_frame(name,w,h),(cx-w//2,cy-h//2))


def ring(d,cx,cy,r,colour,ticks=24):
    d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=colour)
    for i in range(ticks):
        a=i*2*pi/ticks
        inner=r-(5 if i%3==0 else 2)
        d.line([(cx+round(r*cos(a)),cy+round(r*sin(a))),
                (cx+round(inner*cos(a)),cy+round(inner*sin(a)))],fill=colour)


def node(ui,cx,cy,key,selected,owned,avail):
    d=ImageDraw.Draw(ui.im)
    rad=16
    bronze=("#f1b65e" if selected else "#ab8152" if avail or owned else "#62717a")
    if selected:
        ring(d,cx,cy,22,"#d29855",24)
        for dx,dy in ((-1,-1),(1,-1),(-1,1),(1,1)):
            kx,ky=cx+dx*21,cy+dy*21
            d.line((kx-dx*5,ky,kx,ky,kx,ky-dy*5),fill="#fee3a7",width=2)
    if key=="paired":
        d.regular_polygon((cx,cy,rad+4),4,45,fill="#7c5439",outline=bronze,width=2)
    elif key.startswith("width"):
        d.regular_polygon((cx,cy,rad+2),6,0,fill="#203b48",outline=bronze,width=2)
    else:
        d.ellipse((cx-rad,cy-rad,cx+rad,cy+rad),fill="#273d49",outline=bronze,width=2)
    d.ellipse((cx-11,cy-11,cx+11,cy+11),fill="#102637",outline="#7e7059")
    if key.startswith("width"):
        ui.icon("target",cx-8,cy-8)
    else:
        show_specimen(ui,"paired-optic" if key=="paired" else "optic",cx,cy,27)
    if owned or not avail:
        d.ellipse((cx+5,cy-19,cx+21,cy-3),fill="#273747",outline="#c69a66" if owned else "#6c7980")
        ui.icon("check" if owned else "lock",cx+5,cy-19)


def circuit(ui,x,y,w,h,locked):
    ui.panel(x,y,w,h,"inset")
    d=ImageDraw.Draw(ui.im)
    # A faint, etched divisions plate under the electrical dependency paths.
    for xx in range(x+11,x+w-8,12):
        for yy in range(y+10,y+h-8,12): d.point((xx,yy),fill="#395160")
    for xx in range(x+14,x+w-12,7):
        height=5 if (xx-x-14)%35==0 else 2
        d.line((xx,y+8,xx,y+8+height),fill="#655b4d")
    for xx in (x+14,x+w-16):
        for yy in (y+15,y+h-17): pin(d,xx,yy)
    ui.text(x+26,y+17,("Свет и оптика","Light and optics"),14,"ink")
    xa=x+int(w*.24); xb=x+int(w*.71)
    yt=y+int(h*.30); yb=y+int(h*.73); ym=(yt+yb)//2
    if ui.p:
        yt-=10  # Leave room below the top labels for the middle node's selection brackets.
    coords={"power1":(xa,yt),"width1":(xa,yb),"power2":(xb,yt),"width2":(xb,yb),"paired":(xb,ym)}
    parents={"power2":("power1",),"width2":("width1",),"paired":("power1","width1")}
    selected="paired" if locked else "power2"
    for child,inputs in parents.items():
        for parent in inputs:
            px,py=coords[parent]; cx,cy=coords[child]
            path=[(px,py),(px+38,py),(cx-38,cy),(cx,cy)]
            d.line(path,fill="#060f19",width=5)
            d.line(path,fill="#e2ad6a" if child==selected and parent=="power1" else "#796951",width=2)
            if child==selected and parent=="width1":
                for xx in range(px+6,px+35,6):d.line((xx,py,xx+2,py),fill="#bca687")
    names={"power1":("Мощность I","Power I"),"width1":("Ширина I","Width I"),"power2":("Мощность II","Power II"),
           "width2":("Ширина II","Width II"),"paired":("Связанный свет","Linked Light")}
    for key,(cx,cy) in coords.items():
        node(ui,cx,cy,key,key==selected,key=="power1",key in ("power2","width1"))
        # The middle dependency has a side label so its neighbours retain their own bands.
        if key=="paired":
            width=ui.face(11).getlength(ui.tr(names[key]))
            tx=int(cx-26-width);ty=cy
            d.rectangle((tx-3,ty-8,tx+width+3,ty+8),fill="#102538")
            ui.text(tx,ty,names[key],11,"ink","lm")
        else: ui.text(cx,cy+23,names[key],11,"ink","mt")
    rail(d,x+24,y+h-15,w-48)


def upgrade(ui,locked):
    heading(ui,("Улучшения","Upgrades"))
    # Balance of the example profile, after one night with the Power I node purchased.
    ui.icon("coin",ui.w-96,16);ui.text(ui.w-77,16,"85",14)
    ui.icon("pearl",ui.w-42,16);ui.text(ui.w-23,16,"0",14)
    gap=5; fx=10
    labels=[(("Общие","General"),"selected"),(("Ветви","Branches"),"tab"),(("Только доступные","Available only"),"tab")]
    weights=[.26,.29,.45] if ui.p else [.23,.28,.49]
    total=(ui.w-20 if ui.p else min(ui.w-20,450))-gap*2
    for i,(label,style) in enumerate(labels):
        bw=int(total*weights[i])
        ui.button(fx,49,bw,44 if phone(ui) else 30,label,style)
        fx+=bw+gap
    if ui.p:
        px,py,pw,ph=10,96,ui.w-20,246
        ix,iy,iw,ih=10,348,ui.w-20,ui.h-357
    else:
        py=96 if phone(ui) else 85
        px,pw,ph=10,int(ui.w*.58)-12,ui.h-py-9
        ix,iy,iw,ih=px+pw+6,py,ui.w-px-pw-16,ph
    circuit(ui,px,py,pw,ph,locked)
    ui.panel(ix,iy,iw,ih,"gold")
    x=ix+14; y=iy+12; w=iw-28
    hero_h=72 if ui.p else (41 if phone(ui) else 57)
    ui.hero("relic",x,y,w,hero_h)
    y+=hero_h+7
    ui.text(x,y,("Общие · Свет","General · Light"),11,"cyan")
    y+=17
    ui.text(x,y,("Связанный свет","Linked Light") if locked else ("Мощность II","Power II"),19,"gold")
    y+=28
    ui.text(x,y,("Урон по двум целям","Paired damage bonus") if locked else ("Урон луча в секунду","Beam damage per second"),12)
    old,new=("0%","20%") if locked else ("36","42")
    ui.text(x,y+19,old,19,"cyan")
    arrow_x=x+round(ui.face(19).getlength(old))+7
    arrow_y=y+19+ui.face(19).size//2-2
    d=ImageDraw.Draw(ui.im)
    d.line((arrow_x,arrow_y,arrow_x+12,arrow_y),fill=C["gold"],width=2)
    d.line((arrow_x+8,arrow_y-4,arrow_x+12,arrow_y,arrow_x+8,arrow_y+4),fill=C["gold"],width=2)
    ui.text(arrow_x+21,y+19,new,19,"cyan")
    y+=45
    ui.icon("lock" if locked else "check",x,y)
    ui.text(x+21,y+2,("Нужна Ширина I","Requires Width I") if locked else ("Мощность I куплена","Power I purchased"),12)
    y+=21
    ui.icon("coin",x,y); ui.text(x+22,y+2,("75 осколков","75 shards") if locked else ("80 осколков","80 shards"),12)
    action_h=44 if phone(ui) else 36
    ui.button(x,iy+ih-12-action_h,w,action_h,("Недоступно","Unavailable") if locked else ("Купить","Purchase"),"disabled" if locked else "primary","lock" if locked else "coin")

def recess(ui,x,y,w,h,selected=False):
    d=ImageDraw.Draw(ui.im)
    bevel(d,x,y,x+w-1,y+h-1,4,"#1a1618")
    bevel(d,x+1,y+1,x+w-2,y+h-3,4,"#b88451" if selected else "#795b44")
    bevel(d,x+3,y+3,x+w-4,y+h-5,4,"#102330")
    for yy in range(4,h-5):
        t=abs(yy-h*.53)/(h*.53)
        fill=(int(27-9*t),int(45-13*t),int(54-11*t))
        d.line((x+5,y+yy,x+w-6,y+yy),fill=fill)
    if selected:
        for x1,y1,dx,dy in [(x+3,y+3,1,1),(x+w-4,y+3,-1,1),(x+3,y+h-5,1,-1),(x+w-4,y+h-5,-1,-1)]:
            d.line((x1+dx*9,y1,x1,y1,x1,y1+5*dy),fill="#ffd48d",width=2)
    d.line((x+7,y+h-8,x+w-8,y+h-8),fill="#536360")
    d.line((x+5,y+h-4,x+w-6,y+h-4),fill="#ad754c")


def collection(ui,equipped):
    heading(ui,("Коллекция","Collection"),("5 / 5","5 / 5") if equipped else ("4 / 5","4 / 5"))
    if ui.p:
        x,y,w,h=9,54,ui.w-18,240
        ix,iy,iw,ih=9,300,ui.w-18,ui.h-309
    else:
        x,y,w,h=9,54,int(ui.w*.45)-10,ui.h-63
        ix,iy,iw,ih=x+w+7,y,ui.w-x-w-17,h
    wood(ui,x,y,w,h)
    for row,items in enumerate(((0,1),(2,3,4))):
        sy=y+12+row*((h-19)//2)
        l=x+17; inner=w-34
        ui.text(l,sy,("Устройства","Devices") if row==0 else ("Оформление","Cosmetics"),13,"gold")
        sy+=24
        cell_w=(inner-8)//3
        cell_h=(h-23)//2-31
        for col,i in enumerate(items):
            xx=l+col*(cell_w+4)
            recess(ui,xx,sy,cell_w,cell_h,i==2)
            show_specimen(ui,ITEMS[i],xx+cell_w//2,sy+cell_h//2+1,min(cell_w-4,cell_h*4//3-4))
            if i!=2 or equipped:
                d=ImageDraw.Draw(ui.im)
                d.ellipse((xx+cell_w-18,sy+3,xx+cell_w-3,sy+18),fill="#19332f")
                ui.icon("check",xx+cell_w-18,sy+3)
        rail(ImageDraw.Draw(ui.im),l-3,sy+cell_h+3,inner+6)
    ui.panel(ix,iy,iw,ih,"gold")
    px,py,pw=ix+12,iy+10,iw-24
    ph=123 if ui.p else 104
    recess(ui,px,py,pw,ph)
    d=ImageDraw.Draw(ui.im)
    cx=px+pw//2; cy=py+ph//2-3
    # The concentric backplate describes the display case scale behind the model.
    ring(d,cx,cy+2,ph//2-12,"#55594f",36)
    ring(d,cx,cy+2,ph//2-16,"#313f42",12)
    d.ellipse((cx-41,py+ph-20,cx+42,py+ph-10),fill="#101e28")
    show_specimen(ui,"dawn-beacon",cx,cy,min(ph*4//3-6,159))
    for dx in (0,5):
        d.line((px+9+dx,py+20,px+19+dx,py+10),fill="#647778" if dx==0 else "#3c5259")
    rail(d,px+7,py+ph-4,pw-14)
    yy=py+ph+7
    ui.text(px+2,yy,ITEM_NAMES[2],20,"gold")
    yy+=31
    yy=ui.wrap(px+2,yy,pw-4,("Медно-золотая отделка маяка.","Copper and gold trim for the lighthouse."),13)+4
    if equipped:
        ui.icon("check",px,yy);ui.text(px+22,yy+2,("Оформление применено","Equipped"),13,"cyan")
    else:
        ui.icon("check",px,yy)
        yy=ui.wrap(px+23,yy+2,pw-25,("Победа в ночи «Сердце тумана»","Fog Heart victory"),12,"cyan")+4
        ui.text(px+2,yy,("Очки коллекции 0 / 3","Collection points 0 / 3"),11,"muted")
    action_h=44 if phone(ui) else 38
    ui.button(px,iy+ih-13-action_h,pw,action_h,("Снять оформление","Restore original") if equipped else ("Забрать награду","Claim reward"),
              "secondary" if equipped else "primary","gear" if equipped else "check")


def offer(ui,test):
    heading(ui,("Осколки","Shards"),("Тестовый просмотр","Test viewing") if test else None)
    if ui.p:
        ui.hero("archive",0,54,ui.w,181)
        x,y,w,h=10,229,ui.w-20,ui.h-240
    else:
        photo=int(ui.w*.42)
        ui.hero("archive",8,54,photo,ui.h-62)
        x,y,w,h=photo+16,54,ui.w-photo-24,ui.h-62
    ui.panel(x,y,w,h,"gold")
    l=x+17; r=w-34; yy=y+16
    ui.text(l,yy,("Ожидающее предложение","Pending offer") if test else ("Добровольная награда","Optional reward"),19,"gold")
    yy+=34
    rail(ImageDraw.Draw(ui.im),l,yy,r)
    yy+=16
    ui.icon("coin",l,yy+3); ui.text(l+25,yy,("+10 осколков","+10 shards"),18,"cyan")
    yy+=34
    if test:
        ui.wrap(l,yy,r,("Ожидает подтверждения.","Waiting for confirmation."),14)
        actions=[(("Имитировать подтверждение","Simulate confirmation"),"primary"),
                 (("Имитировать отсутствие видео","Simulate no video"),"secondary"),
                 (("Отменить предложение","Cancel offer"),"secondary")]
        action_h=44 if phone(ui) else 38
        for i,(label,style) in enumerate(actions):
            ui.button(l,y+h-12-(3-i)*(action_h+2),r,action_h,label,style)
    else:
        ui.text(l,yy,("Осталось за 24 ч: 2","Remaining in 24 h: 2"),13)
        ui.wrap(l,yy+32,r,("Видеопредложения пока недоступны.","Video offers are currently unavailable."),14,"muted")
        ui.button(l,y+h-58,r,44 if phone(ui) else 40,BACK,"secondary","back")


def draw(ui,slug):
    if slug in ("chronicle","chronicle-chapters"): chronicle(ui,slug.endswith("chapters"))
    elif slug in ("trials","trials-locked"): trials(ui,slug.endswith("locked"))
    elif slug in ("upgrades","upgrades-locked"): upgrade(ui,slug.endswith("locked"))
    elif slug in ("collection","collection-equipped"): collection(ui,slug.endswith("equipped"))
    elif slug in ("reward-offer","reward-test"): offer(ui,slug.endswith("test"))
    else: raise KeyError(slug)


if __name__=="__main__":
    export()
