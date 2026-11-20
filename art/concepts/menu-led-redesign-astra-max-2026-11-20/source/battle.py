"""Combat feedback, user commands and outcome ledgers."""
import math
from PIL import Image,ImageDraw
import material as m
from material import *
from world import draw_world,proj
from layout import shade
from leaves import leaf

def meter(b,x,y,w,frac,theme):
    b.im.alpha_composite(m.sliced("meter-inactive",(w,7)),(x,y))
    b.im.alpha_composite(m.sliced("meter-"+theme,(max(7,round(w*frac)),7)),(x,y))

def battle_head(b,boss):
    w=b.w
    name="Страж глубин|Warden of the Depths" if boss else "Крылатый прилив|Winged Tide"
    if b.p:
        b.box((6,5,w-12,93),"panel-hud")
        b.icon("beacon",13,15);b.text((39,13,162,17),"Маяк 92/120|Beacon 92/120",10,ink=MILK)
        meter(b,39,33,108,92/120,"health")
        b.btn((w-54,12,42,42),"",icon="pause")
        b.title((15,50,w-30,27),name,15,ink=IVORY,floor=11)
        b.text((17,78,w-33,14),"Волны 2/4 · Отбито 1 · 00:43|Waves 2/4 · Cleared 1 · 00:43",8,ink=MUTED,floor=7)
    else:
        b.box((6,4,w-12,49),"panel-hud")
        b.icon("beacon",13,16);b.text((39,10,117,17),"Маяк 92/120|Beacon 92/120",9,ink=MILK)
        meter(b,39,32,101,92/120,"health")
        x=156;b.text((x,8,(round(w*.26) if boss else w-x-138),23),name,11 if boss else 15,"body" if boss else "display",IVORY,vertical="middle",floor=8 if boss else 12)
        b.text((x+1,32,w-x-130,14),"Волны 2/4 · Отбито 1|Waves 2/4 · Cleared 1",8,ink=MUTED)
        b.text((w-130,15,65,21),"00:43",11,ink=PAPER,align="right")
        b.btn((w-54,7,42,42),"",icon="pause")
    if boss:
        y=104 if b.p else 5;ww=b.w-16 if b.p else round(w*.29);x=8 if b.p else (w-125-ww)
        if b.p:b.box((x,y,ww,49),"panel-hud")
        b.icon("skull",x+4,y+8)
        b.text((x+29,y+6,ww-34,20),"Общее здоровье 238/420|Shared health 238/420",8,ink=PAPER,floor=7)
        meter(b,x+27,y+29,ww-35,238/420,"boss")

def battle_foot(b,mode):
    w=b.w;h=b.h
    def ready_button(box,label,ico,detail):
        x,y,bw,bh=box;skin="button-quiet-idle";b.box(box,skin);b.icon(ico,x+5,y+(19 if b.p else 11))
        pad=8 if b.p else 30
        b.text((x+pad,y+4,bw-pad-7,19),label,9,ink=MILK,vertical="middle",floor=8)
        b.text((x+30,y+23,bw-37,15),detail,8,ink=TEAL if ico=="flash" else PAPER,vertical="middle",floor=7)
        b.hit.append({"action":b.loc(label),"rect":list(box),"state":"idle","sprite":skin})
    if b.p:
        b.box((6,h-146,w-12,140),"panel-hud")
        b.icon("lens",14,h-135);b.text((39,h-133,w-53,16),"Базовая · Цели 2/2|Basic · Targets 2/2",9,ink=PAPER,floor=8)
        ww=(w-27)//2
        ready_button((11,h-105,ww,42),"Вспышка|Flash","flash","Готова|Ready")
        ready_button((16+ww,h-105,ww,42),"Вызвать волну|Call wave","waves","Бонус +2|Bonus +2")
        b.btn((11,h-56,w-22,42),"Устройства на берегу|Devices on shore","quiet","devices",size=11)
    else:
        y=h-58;b.box((6,y,w-12,52),"panel-hud")
        b.icon("lens",14,y+15);b.text((39,y+5,126,18),"Базовая|Basic",10,ink=MILK)
        b.text((39,y+27,120,15),"Цели 2/2|Targets 2/2",8,ink=MUTED)
        start=166;cw=(w-start-20)//3
        ready_button((start,y+5,cw,42),"Вспышка|Flash","flash","Готова|Ready")
        ready_button((start+cw+2,y+5,cw,42),"Вызвать волну|Call wave","waves","Бонус +2|Bonus +2")
        b.btn((start+2*(cw+2),y+5,cw,42),"Устройства|Devices","quiet","devices",size=11)

def battle(b,mode):
    boss=mode=="boss";draw_world(b,"battle" if mode=="normal" else mode);battle_head(b,boss)
    if mode=="field":
        x,y=9,105 if b.p else 58;cw=201
        b.box((x,y,cw,44),"panel-hud");b.icon("shield",x+6,y+6)
        b.text((x+32,y+6,cw-40,17),"Общее поле 120/180|Shared field 120/180",9,ink=MILK,floor=8)
        meter(b,x+31,y+28,cw-43,120/180,"shield")
        battle_foot(b,mode)
    elif mode=="command":
        if b.p:x,y,w,h=7,401,b.w-14,230
        else:x,y,w,h=b.w-221,60,213,236
        b.box((x,y,w,h),"panel-stone");b.icon("devices",x+9,y+9)
        b.title((x+35,y+5,w-86,36),"Пушка #2|Cannon #2",15,floor=12)
        b.btn((x+w-45,y+6,36,37),"",icon="close")
        b.text((x+12,y+49,w-24,18),"Бой продолжается|Battle continues",9,ink=TEAL,floor=8)
        b.text((x+12,y+76,w-24,19),"Автоматический приоритет|Automatic priority",8,ink=MUTED,floor=8)
        b.btn((x+11,y+98,w-22,35),"Ближайший|Nearest","tab","next","selected",10)
        b.btn((x+11,y+140,w-22,39),"Указать врага|Choose enemy","primary","target",size=11)
        b.btn((x+11,y+184,w-22,37),"Сбросить в авто|Return to auto","quiet","retry",size=10)
        if not b.p:battle_foot(b,mode)
    elif mode=="aim":
        if b.p:x,y,w,h=8,b.h-122,b.w-16,111
        else:x,y,w,h=round(b.w*.15),b.h-73,round(b.w*.7),64
        b.box((x,y,w,h),"panel-stone");b.icon("seal",x+10,y+9)
        b.title((x+37,y+5,w-(48 if b.p else 142),30),"Печать · Укажите цель|Seal · Choose target",13,floor=11)
        b.text((x+12,y+39,w-24 if b.p else w-118,21),"Направление луча сохранено|Beam direction held",8,ink=MUTED,floor=8)
        b.btn((x+10 if b.p else x+w-102,y+61 if b.p else y+11,w-20 if b.p else 91,40),"Отмена|Cancel","quiet",size=11)
    else:battle_foot(b,mode)

def outcome(b,kind):
    final=kind=="epilogue";win=kind=="victory";b.base(.77)
    label="Рассвет Авалона|Avalon Dawn" if final else "До рассвета.|Until Dawn." if win else "Свет погас.|The Light Went Out."
    night="Сердце тумана|Heart of the Mist" if final else "Крылатый прилив|Winged Tide" if win else "Страж глубин|Warden of the Depths"
    b.head(label,b.loc(night)+b.loc(" · Итог| · Result"),False,mark="sun" if (win or final) else "moon")
    if b.p:
        artbox=(8,69,b.w-16,155 if final else 111)
        leftx,lefty=8,artbox[1]+artbox[3]+4
        if final:
            b.picture(artbox,7)
        else:b.picture(artbox,0)
        htext=67 if final or not win else 50
        b.box((leftx,lefty,b.w-16,htext),"panel-hud")
        b.text((leftx+9,lefty+6,b.w-33,htext-11),result_copy(kind),9,ink=MILK,floor=8)
        lx,ly,lw,lh=8,lefty+htext+5,b.w-16,b.h-54-(lefty+htext+5)
    else:
        leftw=round(b.w*.455);artbox=(8,69,leftw,132)
        b.picture(artbox,7 if final else 0)
        lx,ly,lw,lh=leftw+14,69,b.w-leftw-22,229
        b.box((8,205,leftw,90),"panel-hud")
        b.text((18,214,leftw-20,71),result_copy(kind),9,ink=MILK,floor=8)
    x,y,w,h=leaf(b,(lx,ly,lw,lh))
    b.title((x,y,w,24),"Итоги ночи|Night ledger",15,ink=PARCH_INK,floor=13)
    vals=([82,108,8,0,455,571] if final else [40,56,3,0,65,124] if win else [14,18,1,0,0,19])
    rows=["Уничтожено|Defeated","За существ|Creatures","За досрочные волны|Early waves","За спасение корабля|Ship rescue","За победу|Victory","Итого|Total"]
    dy=20 if not b.p else (23 if final else 25);top=y+29
    for i,(key,value) in enumerate(zip(rows,vals)):
        yy=top+i*dy
        if i==5:b.line(x,yy-3,w,True)
        b.text((x,yy,w-54,dy-1),key,9,ink=PARCH_INK if i in (0,5) else PARCH_SUB,floor=8)
        b.text((x+w-54,yy,54,dy-1),str(value) if i==0 else "+"+str(value),10 if i==5 else 9,ink=PARCH_INK,align="right",floor=8)
    yy=top+6*dy+1
    if final:
        b.icon("pearl",x,yy-2);b.text((x+23,yy,w-24,20),"Жемчуг глубин +4|Depth pearls +4",9,ink=PARCH_INK,floor=8)
        yy+=21
    b.icon("check",x,yy);b.text((x+24,yy+2,w-26,27),"Результат сохранён|Result saved",8,ink=PARCH_INK,vertical="middle",floor=7)
    if final:b.footer([("Коллекция|Collection","quiet","collection"),("К повтору|Replay","primary")])
    elif win:b.footer([("Коллекция|Collection","quiet","collection"),("Следующая ночь|Next night","primary","next")])
    else:b.footer([("Коллекция|Collection","quiet","collection"),("Подготовка к повтору|Prepare to retry","primary")])

def result_copy(kind):
    if kind=="epilogue":return "Туман отступил. Семь маяков встретили рассвет, и корабли снова видят путь домой.|The mist receded. Seven beacons greeted the dawn, and ships can see the way home again."
    if kind=="victory":return "Маяк выстоял. Берег снова принадлежит тебе.|The lighthouse held. The shore is yours again."
    return "Маяк разрушен. Босс побеждён. Жемчуг за ночь не выдан, следующая глава закрыта.|The lighthouse fell. The boss was defeated. No pearl was awarded. The next chapter is locked."
