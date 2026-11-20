"""Navigation, preferences and the keeper's folios."""
from PIL import Image,ImageDraw,ImageOps
import material as m
from material import *
from layout import shade
from world import DATA

ROMAN=("I","II","III","IV","V","VI","VII")
NIGHTS=("Первый свет|First Light","Разбитый берег|Broken Shore","Крылатый прилив|Winged Tide",
        "Обратный прилив|Turning Tide","Огни на отмели|Lights on the Shoal","Страж глубин|Warden of the Depths")

def select_game(b,new_profile=False,prototype=False):
    b.base(.04)
    x=(b.w-244)//2 if b.p else max(18,(b.w-640)//2+18)
    y=305 if b.p else 16
    if b.p:
        b.box((x-8,y-5,260,326),"panel-stone")
    else:b.box((x-8,y-6,260,324),"panel-stone")
    b.title((x+4,y+5,236,38),"Выбор игры|Choose game",24,"center",floor=18)
    b.line(x+21,y+47,202,True)
    b.icon("book",x+14,y+53)
    b.text((x+40,y+56,197,17),"Прототип · Дальний берег|Prototype · Far Shore" if prototype else "Глава I · Туманный берег|Chapter I · Misty Shore",9,ink=PAPER,floor=8)
    b.text((x+40,y+75,195,16),"Отдельное прохождение|Separate progress" if prototype else "Ночь 3 из 6 · Крылатый прилив|Night 3 of 6 · Winged Tide" if not new_profile else "Нет прохождения|No campaign yet",8,ink=MUTED,floor=7)
    # Same 240x48 primary footprint as Play in the approved menu.
    b.btn((x+2,y+97,240,48),"Продолжить|Continue","quiet" if new_profile else "primary",state="disabled" if new_profile else "idle",size=16)
    b.btn((x+2,y+150,240,48),"Новая игра|New game","primary" if new_profile else "quiet",size=15)
    b.btn((x+2,y+203,240,48),"Испытания|Trials","quiet","flag" if prototype else "lock","idle" if prototype else "disabled",14)
    b.btn((x+57,y+273,130,41),"Назад|Back",icon="back",size=11)

def slider(b,x,y,w,label,value):
    b.text((x,y,w-43,19),label,10,ink=MILK,floor=9)
    b.text((x+w-46,y,45,19),str(value)+"%",10,ink=GOLD,align="right")
    ty=y+24
    b.im.alpha_composite(m.sliced("slider-track",(w,7)),(x,ty))
    fw=max(9,round(w*value/100))
    b.im.alpha_composite(m.sliced("slider-fill",(fw,7)),(x,ty))
    b.sprite("slider-thumb",x+fw-6,ty-4)
    b.hit.append({"action":b.loc(label),"rect":[x,ty-17,w,42],"state":"slider"})

def settings(b):
    b.base(.24); b.head("Настройки|Settings",back=False,mark="settings")
    if b.p:
        boxes=[(10,80,b.w-20,219),(10,313,b.w-20,231)]
    else:
        ww=(b.w-28)//2
        boxes=[(9,72,ww,228),(16+ww,72,ww,228)]
    b.box(boxes[0]); b.box(boxes[1])
    x,y,w,h=boxes[0];b.title((x+15,y+10,w-32,28),"Звук|Sound",17)
    b.btn((x+15,y+44,w-30,41),"Звук включён|Sound on","tab","sound","selected")
    slider(b,x+18,y+105,w-36,"Музыка|Music",65)
    slider(b,x+18,y+166,w-36,"Эффекты|Effects",80)
    x,y,w,h=boxes[1];b.title((x+15,y+10,w-32,28),"Язык|Language",17)
    gap=3;step=(w-28-2*gap)//3
    for i,la in enumerate(("Авто|Auto","Русский|Russian","English")):
        active=(b.lang=="ru" and i==1) or (b.lang=="en" and i==2)
        b.btn((x+13+i*(step+gap),y+47,step,42),la,"tab",state="selected" if active else "idle",size=10)
    b.line(x+16,y+108,w-32)
    b.title((x+15,y+121,w-32,28),"Размер текста|Text size",16)
    sw=(w-29)//2
    for i,la in enumerate(("Обычный|Normal","Крупный|Large")):
        b.btn((x+13+i*(sw+3),y+160,sw,42),la,"tab",state="selected" if i==int(b.large) else "idle",size=11)
    b.footer([("Назад|Back","quiet","back")])

def leaf(b,box):
    x,y,w,h=box
    b.box(box,"panel-cover");b.box((x+5,y+4,w-10,h-11),"panel-leaf")
    d=b.d
    for i in [0,2,5]:
        d.line((x+10,y+h-8-i,x+w-11,y+h-8-i),fill=["#977956","#a18763","#cbb08b"][i%3])
    for yy in range(y+24,y+h-22,34):
        d.line((x+4,yy,x+11,yy+2),fill="#7e6953",width=2)
        d.point((x+9,yy+1),fill="#dec7a2")
    return x+17,y+12,w-33,h-29

def hero_caption(b,box,idx,label,subtitle):
    x,y,w,h=box
    b.picture((x,y,w,h),idx)
    block_h=50 if not b.p else 53
    block=shade(b.im.crop((x+4,y+h-block_h-4,x+w-4,y+h-4)),.85)
    b.im.paste(block,(x+4,y+h-block_h-4))
    b.text((x+10,y+h-block_h,w-20,15),subtitle,8,ink=PAPER,floor=7)
    b.title((x+10,y+h-block_h+13,w-20,30),label,17,floor=13)

def journal(b,index,replay=False):
    rec=DATA["chapters"][index]
    b.base(.76)
    if b.p:
        b.picture((8,9,b.w-16,220),index)
        x,y,w,h=leaf(b,(8,232,b.w-16,287))
    else:
        left=round((b.w-23)*.485)
        b.picture((8,9,left,286),index)
        x,y,w,h=leaf(b,(left+13,9,b.w-left-21,286))
    b.icon("journal",x,y)
    b.text((x+26,y+3,w-26,18),f"Запись смотрителя · {ROMAN[index]}|Keeper’s journal · {ROMAN[index]}",9,ink=PARCH_SUB,floor=8)
    b.title((x,y+27,w,64 if b.p else 56),rec["name"],23,ink=PARCH_INK,floor=17)
    sep=92 if b.p else 89
    b.line(x,y+sep,w,True)
    b.text((x+1,y+sep+13,w-2,h-sep-23),rec["journal"],10,ink=PARCH_INK,floor=8)
    if replay:
        b.footer([("К Хронике|Back to Chronicle","primary","book")])
    elif b.p:
        b.btn((22,530,b.w-44,42),"Пропустить вступление|Skip intro","quiet",size=12)
        b.btn(((b.w-240)//2,580,240,48),"Продолжить|Continue","primary",size=15)
    else:b.footer([("Пропустить вступление|Skip intro","quiet"),("Продолжить|Continue","primary")])

def chronicle(b,kind):
    trials=kind=="trials";contents=kind=="chapters";b.base(.77)
    b.head("Испытания|Trials" if trials else "Хроника маяка|Lighthouse Chronicle",
           "Прототип · отдельное прохождение|Prototype · separate progress" if trials else "Кампания · 7 глав|Campaign · 7 chapters",back=not(contents or trials),mark="book")
    if b.p:
        hx,hy,hw,hh=9,69,b.w-18,(127 if contents else 146)
        bx,by,bw,bh=8,hy+hh+5,b.w-16,b.h-(hy+hh+5)-52
    else:
        hw=max(235,round(b.w*.43));hx,hy,hh=9,69,228
        bx,by,bw,bh=hx+hw+5,69,b.w-hw-22,228
    if trials:
        b.box((hx,hy,hw,hh),"panel-stone")
        ox,oy=hw//2,hh//2
        sp=m.SPRITES["object-turtle"];b.im.alpha_composite(sp,(hx+ox-sp.width//2,hy+(hh-60-sp.height)//2+5))
        b.text((hx+9,hy+hh-58,hw-18,25),"Броневой фронт|Armored Front",15,"display",GOLD,"center","middle",True,floor=13)
        b.text((hx+10,hy+hh-30,hw-20,25),"Броня черепахи · 840|Turtle armor · 840",9,ink=MUTED,align="center",floor=8)
    else:
        hero_caption(b,(hx,hy,hw,hh),0,"Туманный берег|Misty Shore","Глава I · 2 из 6 пройдено|Chapter I · 2 of 6 cleared")
    x,y,w,h=leaf(b,(bx,by,bw,bh))
    b.title((x,y,w,27),"Оглавление|Contents" if contents else "Испытания|Trials" if trials else "Ночи главы|Chapter nights",16,ink=PARCH_INK,floor=12)
    if contents:
        items=[(c["name"],"check" if i==0 else "lock") for i,c in enumerate(DATA["chapters"][:(7 if b.p else 4)])]
        rw=29 if not b.p else 39
        for i,(name,ico) in enumerate(items):
            b.row((x,y+31+i*(rw+2),w,rw),b.loc(name),icon=ico,selected=(i==0),paper=True)
        b.text((x,y+31+len(items)*(rw+2),w,22),"Главы 1–4 из 7|Chapters 1–4 of 7" if not b.p else "После Стража глубин откроется глава II.|Chapter II opens after the Warden.",7,ink=PARCH_SUB,floor=7)
        b.footer([("Назад|Back","quiet","back"),("К ночам|Chapter nights","primary","book")])
    elif trials:
        items=[("Сигнал бедствия|Distress Signal","Пройдено|Cleared","check"),("Броневой фронт|Armored Front","Выбрано|Selected","flag"),("Воздушный налёт|Air Raid","Доступно|Available","waves"),("Смешанный штурм|Combined Assault","Доступно|Available","skull")]
        for i,(t,desc,ico) in enumerate(items):b.row((x,y+30+i*(45 if b.p else 35),w,42 if b.p else 33),t,desc,ico,i==1,True)
        yy=y+(219 if b.p else 173)
        b.text((x,yy,w,h-(yy-y)), "Броневой фронт · После Дальнего берега|Armored Front · After Far Shore",8,ink=PARCH_SUB,floor=7)
        b.footer([("Назад|Back","quiet","back"),("К подготовке|Prepare","primary")])
    else:
        rh=46 if b.p else 34
        for i,name in enumerate(NIGHTS[:4]):
            desc=["Пройдена|Cleared","Пройдена|Cleared","Выбрана|Selected","После Крылатого прилива|After Winged Tide"][i]
            b.row((x,y+31+i*(rh+2),w,rh),name,desc,["check","check","flag","lock"][i],i==2,True)
        yy=y+32+4*(rh+2)
        b.text((x,yy,w-41,21),"Лист 1 / 2|Page 1 / 2",8,ink=PARCH_SUB,vertical="middle")
        b.icon("next",x+w-25,yy)
        if b.p:
            b.btn((x,yy+34,w,40),"Смотреть вступление|Replay introduction","quiet","journal",size=11)
        else:
            b.btn((hx+15,hy+12,148,35),"Смотреть вступление|Replay introduction","quiet","journal",size=9)
        b.footer([("Главы|Chapters","quiet","book"),("К подготовке|Prepare","primary")])
