"""Preparation, equipment choices and instance operations."""
from PIL import Image,ImageDraw,ImageOps
import material as m
from material import *
from world import draw_world,proj,PLACED
from layout import shade

def prep_top(b):
    w=b.w
    if b.p:
        b.box((7,5,w-14,92),"panel-hud")
        b.btn((12,12,64,37),"Назад|Back",size=10)
        b.text((83,10,w-95,14),"Глава I · Ночь 3 из 6|Chapter I · Night 3 of 6",8,ink=MUTED)
        b.title((82,25,w-94,28),"Крылатый прилив|Winged Tide",16,floor=11)
        b.btn((12,53,109,37),"Хроника|Chronicle","quiet","book",size=10)
        b.icon("shard",137,63);b.text((161,66,41,16),"124",9)
        b.icon("pearl",212,63);b.text((236,66,31,16),"0",9)
    else:
        b.box((7,5,w-14,50),"panel-hud")
        b.btn((12,9,76,42),"Назад|Back","quiet","back",size=10)
        b.btn((91,9,42,42),"",icon="book")
        b.text((141,10,221,12),"Глава I · Ночь 3 из 6|Chapter I · Night 3 of 6",7,ink=MUTED)
        b.title((140,22,239,28),"Крылатый прилив|Winged Tide",18,floor=12)
        b.icon("shard",w-242,18);b.text((w-221,20,36,19),"124",10)
        b.icon("pearl",w-182,18);b.text((w-160,20,22,19),"0",10)
        b.btn((w-129,9,119,42),"Разведка|Scouting","quiet","recon",size=11)

def prep_base(b,mode="prep"):
    draw_world(b,mode);prep_top(b)
    if b.p:
        for i,(label,ww) in enumerate([("Развитие|Upgrades",85),("Коллекция|Collection",101),("Разведка|Scouting",84)]):
            b.btn(([8,97,202][i],104,ww,40),label,"quiet",size=9)
        b.box((7,428,b.w-14,204),"panel-stone")
        b.text((19,437,b.w-34,15),"Объекты 2/4 · Типы 2/2|Devices 2/4 · Types 2/2",8,ink=MUTED)
        b.btn((13,455,b.w-26,40),"Устройства|Devices","quiet","devices",size=11)
        cw=(b.w-30)//2
        for i,(lab,ico) in enumerate([("Линза|Lens","lens"),("Способность|Ability","flash")]):
            b.btn((13+i*(cw+4),499,cw,40),lab,"quiet",size=10)
        b.text((17,546,b.w-34,15),"Расстановка и старт бесплатны|Placement and start are free",8,ink=PAPER,align="center")
        b.btn(((b.w-240)//2,571,240,48),"Начать ночь|Start night","primary",size=16)
    else:
        b.btn((9,62,146,42),"Развитие|Upgrades","quiet","tree",size=11)
        b.btn((9,108,146,42),"Коллекция|Collection","quiet","collection",size=11)
        h=b.h;b.box((7,h-80,b.w-14,73),"panel-stone")
        start_w=184; left_w=b.w-start_w-33
        b.text((17,h-73,left_w-14,14),"Объекты 2/4 · Типы 2/2|Devices 2/4 · Types 2/2",8,ink=MUTED)
        step=(left_w-7)//3
        for i,(lab,ico) in enumerate([("Устройства|Devices","devices"),("Базовая|Basic","lens"),("Вспышка|Flash","flash")]):
            b.btn((13+i*(step+2),h-53,step,41),lab,"quiet",ico,size=11)
        b.btn((b.w-start_w-12,h-73,start_w,48),"Начать ночь|Start night","primary",size=15)
        b.text((b.w-start_w-11,h-23,start_w-2,12),"Расстановка бесплатна|Placement is free",7,ink=PAPER,align="center")

def panel_title(b,x,y,w,title,section):
    b.text((x+12,y+10,w-65,15),section,8,ink=MUTED,floor=7)
    b.title((x+12,y+23,w-66,34),title,19,floor=12)
    b.btn((x+w-49,y+9,40,41),"",icon="close")
    b.line(x+12,y+63,w-24)
    return x+13,y+73,w-26

def drawer(b,kind):
    # Same projector and coordinates at both ends of every operation.
    draw_world(b,"prep")
    prep_top(b)
    if b.p:
        box=(7,192,b.w-14,438)
    else:
        width=max(274,round(b.w*.446));box=(b.w-width-8,60,width,292)
    b.box(box);x0,y0,w0,h0=box
    titles={"lens":"Линза|Lens","ability":"Способность|Ability","devices":"Устройства|Devices","service":"Мои устройства|Owned devices","recon":"Разведка|Scouting","currency":"Осколки|Shards"}
    x,y,w=panel_title(b,x0,y0,w0,titles[kind],"Подготовка|Preparation")
    remaining=h0-(y-y0)-11
    if kind=="lens":
        items=[("Базовая|Basic","Ровный свет без компромиссов.|Steady light without tradeoffs.","check"),
               ("Расширенная|Expanded","Открывается в главе II.|Unlocks in Chapter II.","lock"),
               ("Замедляющая|Slowing","Открывается в главе II.|Unlocks in Chapter II.","lock")]
        for i,(label,desc,ico) in enumerate(items):
            b.row((x,y+i*(49 if b.p else 45),w,45 if b.p else 42),label,desc,ico,i==0)
        yy=y+(162 if b.p else 139)
        b.text((x,yy,w,18),"Предел целей 2 · Дальность 300|Target limit 2 · Range 300",9,ink=PAPER,floor=8)
        b.btn((x,y0+h0-55,w,43),"Развитие кампании|Campaign upgrades","quiet","tree")
    elif kind=="ability":
        for i,label in enumerate(("Без способности|No ability","Вспышка|Flash","Перегрузка|Overload","Печать|Seal","Залп|Barrage","Бастион|Bastion")):
            col,row=i%2,i//2;cw=(w-5)//2
            b.btn((x+col*(cw+5),y+row*44,cw,41),label,"tab",state="selected" if i==1 else "disabled" if i>1 else "idle",size=10)
        b.text((x,y+144,w,18),"Выбрана Вспышка|Flash equipped",10,ink=GOLD)
        b.text((x,y+169,w,remaining-170),"Радиус 210 · Урон 22 · Оглушение 2 с · Перезарядка 18 с|Radius 210 · Damage 22 · Stun 2 s · Cooldown 18 s",9,ink=MUTED,floor=8)
    elif kind=="devices":
        b.row((x,y,w,47),"Пушка|Cannon","В запасе 1 · На поле 1/2|Reserve 1 · Placed 1/2","devices",True)
        yy=y+58;b.icon("target",x,yy)
        b.text((x+25,yy+2,w-26,30),"70 HP · Дальность 160 · Урон 16|70 HP · Range 160 · Damage 16",9,ink=MILK,floor=8)
        b.btn((x,y+97,w,42),"Купить экземпляр · 20|Buy instance · 20","quiet","shard")
        b.btn((x,y0+h0-56,w,44),"Мои устройства|Owned devices","primary","devices")
    elif kind=="service":
        b.text((x,y,w,24),"Световая ловушка #4|Light trap #4",14,"display",IVORY,floor=12)
        b.text((x,y+30,w,18),"В запасе · Корпус 18/30 HP|In reserve · Hull 18/30 HP",9,ink=MILK)
        b.text((x,y+53,w,18),"Заряды 0/1|Charges 0/1",9,ink=RED)
        b.btn((x,y+83,w,42),"Ремонт · 2 осколка|Repair · 2 shards","quiet","repair")
        b.btn((x,y+130,w,42),"Перезарядить · 2 осколка|Recharge · 2 shards","primary","flash")
        if b.p:b.btn((x,y+190,w,42),"Расставить|Place","quiet","pin","disabled")
    elif kind=="recon":
        b.text((x,y,w,50),"Летучие мыши атакуют устройства с воды. Пушка не достаёт летающих.|Bats approach devices from the water. Cannons cannot hit flying enemies.",9,ink=MILK,floor=8)
        yy=y+61
        b.text((x,yy,w,14),"Встреченные существа|Encountered creatures",8,ink=PAPER)
        for i,(key,lab) in enumerate([("ghost","Призрак|Ghost"),("turtle","Искажённая черепаха|Twisted Turtle")]):
            sp=m.SPRITES["world-"+key];xx=x+2;sy=yy+22+i*37;b.im.alpha_composite(sp,(xx,sy))
            b.text((xx+40,sy+3,w-43,25),lab,11,"display",MILK,vertical="middle",floor=9)
        b.text((x,y0+h0-37,w,25),"4 волны · Следующая ночь после полной победы|4 waves · Full victory opens the next night",8,ink=MUTED,floor=7)
    else:
        b.icon("shard",x,y)
        b.title((x+26,y,w-27,38),"124",22)
        b.text((x,y+54,w,74),"Награды за существ, завершённые досрочные волны и победу поступают после сохранения итога.|Shards from creatures, completed early waves and victory are credited when the result is saved.",9,ink=MILK,floor=8)
        b.text((x,y+139,w,remaining-141),"Видеопредложения пока недоступны.|Video offers are currently unavailable.",9,ink=MUTED)

def trial_mode(b):
    b.base(.83);b.head("Разведка|Scouting","Прототип · Броневой фронт|Prototype · Armored Front",back=False,mark="recon")
    if b.p:
        box=(8,74,b.w-16,488)
    else:box=(max(8,(b.w-554)//2),69,min(554,b.w-16),225)
    bx,by,bw,bh=box;b.box(box)
    x,y,w=bx+15,by+11,bw-30
    b.title((x,y,w,35),"Режим испытания|Trial mode",18,floor=14)
    b.text((x,y+40,w,27),"Режим выбирается до начала ночи.|Choose the mode before starting the night.",9,ink=MUTED,floor=8)
    for i,(title,desc) in enumerate([("Переходный|Transition","Броня 420 · Награда 190|Armor 420 · Reward 190"),("Штурм|Assault","Броня 840 · Усиленные враги|Armor 840 · Stronger enemies")]):
        step=84 if b.p else 59;b.row((x,y+74+i*step,w,step-5),title,desc,"shield" if i==0 else "skull",i==1)
    b.footer([("К подготовке|Preparation","primary","back")])

def place(b,invalid=False):
    draw_world(b,"invalid" if invalid else "placing");prep_top(b)
    w=b.w;h=b.h;yy=(h-206 if b.p else h-97)
    b.box((7,yy,w-14,h-yy-7),"panel-signal" if invalid else "panel-stone")
    bx=18
    if invalid:
        title="Устройство за границей суши|Device beyond the shore"
        desc="Световая ловушка #4 · Переставьте её или верните в запас.|Light trap #4 · Move it onto land or return it to reserve."
    else:
        title="Переставить пушку #2|Move cannon #2"
        desc="Выберите точку на суше. Расстановка бесплатна.|Choose a point on land. Placement is free."
    b.icon("warning" if invalid else "move",bx,yy+11)
    b.title((bx+28,yy+6,w-58,29),title,15,ink=RED if invalid else GOLD,floor=10)
    b.text((bx,yy+40,w-38,(45 if b.p else 18)),desc,9,ink=MILK,floor=8)
    if b.p:
        b.btn((bx,yy+99,w-37,42),"Переставить|Move" if invalid else "Установить|Place here","primary","move")
        b.btn((bx,yy+146,w-37,42),"В запас|To reserve" if invalid else "Отмена|Cancel","quiet")
    else:
        cw=140
        b.btn((w-14-cw*2-5,yy+53,cw,37),"В запас|To reserve" if invalid else "Отмена|Cancel","quiet",size=10)
        b.btn((w-14-cw,yy+53,cw,37),"Переставить|Move" if invalid else "Установить|Place here","primary",size=11)
