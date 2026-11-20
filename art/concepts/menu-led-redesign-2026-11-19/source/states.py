"""Purchase, collection, result and modal states."""
from screens import *

def develop(p,buy=False,poor=False):
    w,h=p.w,p.h;p.scenic(0,223);p.header('Развитие кампании')
    y=66
    if p.p:
        # Tab bar scrolls sideways; following categories stay accessible in the category sheet.
        tabs=['Все','Доступные','Маяк'];avail=w-16
    else:
        tabs=['Все','Доступные','Маяк','Устройства','Линзы','Способности'];avail=w-26
    bw=avail//len(tabs)
    tx=8
    for i,s in enumerate(tabs):
        tw=bw+(18 if i==5 else -18 if i==0 and not p.p else 0)
        p.btn(s,tx,y,tw-3,35,'selected' if i==2 else 'normal',mini=True);tx+=tw
    x=12;top=114;left=(w-24 if p.p else round(w*.42)-18)
    if not p.p or not buy:
        p.txt('Сила света',x+4,top,left-8,20,GOLD,'title')
        step=82 if p.p else 58
        for i,(s,ic,price) in enumerate([('Мощность I','flash','45'),('Мощность II','lock','80'),('Ширина I','lens','45')]):
            yy=top+37+i*step
            if not p.p and i==2:continue
            p.tile('tab-selected' if i==0 else 'tab-normal',x,yy,left,step-7)
            p.icon(ic,x+11,yy+(step-25)//2)
            p.txt(s,x+38,yy+9,left-78,17,PAPER,'label');p.icon('shard',x+left-49,yy+11);p.txt(price,x+left-28,yy+13,20,13,GOLD,'body','right')
            if p.p:p.txt('Закрыто' if i==1 else 'Доступно',x+39,yy+39,left-50,13,MUTED)
        if p.p:
            p.btn('Мощность I',x,h-63,left,45,icon='next');return
    sx=12 if p.p else left+24;sw=w-sx-12;sy=114 if p.p else 112;sh=(h-32 if p.p else h-11)-sy
    p.tile('panel-normal',sx,sy,sw,sh);xx=sx+16;aw=sw-32
    p.icon('flash',xx,sy+16,2);p.txt('Мощность I',xx+46,sy+21,aw-48,24,GOLD,'title')
    p.div(xx,sy+68,aw)
    p.txt('Урон в секунду',xx,sy+82,aw,15,MUTED)
    p.txt('30 → 36',xx,sy+104,aw,25,PAPER)
    p.txt('Без требований',xx,sy+146,aw,14,TEXT)
    p.txt('Не хватает осколков 15' if poor else 'Доступно',xx,sy+170,aw,14,RED if poor else TEAL)
    p.btn('Купить · 45',xx,sy+sh-50,aw,40,'disabled' if poor else 'normal',icon='shard')

def collection(p):
    w,h=p.w,p.h;p.scenic(7,224);p.header('Коллекция')
    x=10;y=72;ww=w-20 if p.p else int(w*.43)-12
    if p.p:
        p.art(7,x,y,ww,121);y+=130
    for i,(s,ic) in enumerate([('Маяк рассвета','beacon'),('Осадная пушка','cannon'),('Дальний гарпун','aim'),('Бронзовые устройства','gear'),('Лунный луч','moon')]):
        if p.p and i>2:break
        p.btn(s,x,y+i*50,ww,45,'selected' if i==0 else 'normal',icon=ic,mini=True)
    sx=x if p.p else x+ww+12;sw=w-sx-10;sy=y+156 if p.p else 72;sh=h-sy-12
    p.tile('panel-normal',sx,sy,sw,sh)
    if not p.p:p.art(7,sx+9,sy+9,sw-18,86)
    oy=sy+(14 if p.p else 106);p.txt('Маяк рассвета',sx+15,oy,sw-30,22,GOLD,'title')
    p.txt('Медно-золотая отделка маяка. Меняет внешний вид.',sx+16,oy+38,sw-32,15,TEXT,lines=3)
    p.btn('Применить',sx+12,h-66,sw-24,42,icon='check')

def device(p):
    preparation(p);modal(p,'Мои устройства','',[],icon='cannon',custom=True)
    x,y,w,h=p.modal;left=x+20;aw=w-40
    p.txt('Пушка #1',left,y+64,aw,22,GOLD,'title')
    p.rows([('На поле','49 / 70 HP'),('Ремонт','2 ◈')],left,y+101,aw,28)
    for i,s in enumerate(['Переставить','В запас','Ремонт · 2 ◈']):p.btn(s,left,y+163+i*42,aw,38,mini=(i!=2))

def result(p,won=True,pending=False):
    w,h=p.w,p.h;p.scenic(7 if won else 6,219)
    x=12; artw=w-24 if p.p else int(w*.46)-18
    if p.p:
        p.art(7 if won else 6,x,10,artw,110);ty=132
    else:p.art(7 if won else 6,0,0,artw+8,h);p.shade((0,152,artw+8,h-152),INK,197);ty=167
    p.txt('Первый свет',x+6,ty,artw-12,14,MUTED,'label')
    p.txt('До рассвета.' if won else 'Свет погас.',x+5,ty+24,artw-10,25 if p.lang=='en' else 29,GOLD if won else RED,'title')
    if not p.p:p.txt('Маяк выстоял. Берег снова принадлежит тебе.' if won else 'Маяк разрушен. Попробуй раньше переключаться между угрозами.',x+6,ty+69,artw-16,15,TEXT,lines=4)
    sx=14 if p.p else artw+23;sy=207 if p.p else 18;sw=w-sx-14
    vals=['40','+48','+0','+0','+45','+93'] if won else ['12','+14','+0','+0','+0','+14']
    p.rows(list(zip(['Уничтожено','За существ','За досрочные волны','За спасение корабля','За победу','Итого'],vals)),sx,sy,sw,31 if p.p else 27)
    yy=sy+(190 if p.p else 164);p.icon('warning' if pending else 'check',sx,yy-1);p.txt('Результат ещё не сохранён' if pending else 'Результат сохранён на этом устройстве',sx+23,yy,sw-23,13,RED if pending else TEAL,lines=2)
    yy=yy+(42 if p.p else 31)
    p.btn('Следующая ночь' if won else 'Подготовка к повтору',sx,yy,sw,45,'disabled' if pending else 'normal')
    if won:
        p.btn('Подготовка к повтору',sx,yy+49,sw,34,mini=True)
    p.btn('Коллекция',sx,yy+(87 if won else 51),sw,34,icon='bag',mini=True)
    if p.p:p.btn('Главное меню',sx,h-53,sw,38,icon='back',mini=True)
    else:p.btn('Главное меню',10,h-48,min(artw-10,171),37,icon='back',mini=True)

def end(p):
    w,h=p.w,p.h;p.paste(fit_art(VISTAS[7],w,h,.54),0,0)
    y=h-(280 if p.p else 151);p.shade((0,y,w,h-y),INK,235);x=18 if p.p else 26
    p.txt('Сердце тумана',x,y+12,w-2*x,13,PAPER,'label')
    p.txt('Рассвет Авалона',x,y+35,w-2*x,28,GOLD,'title')
    p.txt('Туман отступил. Семь маяков встретили рассвет, и корабли снова видят путь домой.',x,y+77,w-2*x if p.p else w-245,16,TEXT,lines=5)
    p.btn('Коллекция',(w-240)//2 if p.p else w-206,h-63,240 if p.p else 190,47,icon='bag')
    p.btn('Итого · +403',x,h-(115 if p.p else 42),w-2*x if p.p else 166,34,icon='down',mini=True)

def modal(p,title,body,actions,icon='book',custom=False):
    W,H=p.w,p.h;w=min(W-20,425);h=310 if custom else min(H-14,(248 if p.p else 202)+max(0,len(actions)-2)*43+(25 if len(body)>95 else 0))
    x=(W-w)//2;y=(H-h)//2
    p.shade((0,0,W,H),INK,171);p.tile('panel-normal',x,y,w,h);p.modal=(x,y,w,h)
    p.icon(icon,x+15,y+15);title_height=p.txt(title,x+42,y+16,w-60,21,GOLD,'title',lines=2)
    divider=max(49,16+title_height+11);p.div(x+14,y+divider,w-28)
    if body:p.txt(body,x+17,y+divider+11,w-34,15,TEXT,lines=8,height=h-divider-27-len(actions)*41)
    yy=y+h-12-len(actions)*41
    for i,(a,primary) in enumerate(actions):
        p.btn(a,x+15,yy+41*i,w-30,37,mini=not primary)

def pause(p,abandon=False):
    battle(p)
    if abandon:modal(p,'Прервать эту ночь?','Все награды и новые встречи этой ночи будут потеряны. Устройства вернутся к состоянию перед началом ночи. Покупки и ремонт подготовки сохраняются.',[('Остаться в паузе',True),('Прервать → подготовка',False),('Прервать → главное меню',False)],'warning')
    else:modal(p,'Тихая минута.','Ночь ждёт. Направление света сохранено.',[('Продолжить ночь',True),('Настройки',False),('Прервать ночь…',False)],'pause')

def err(p,settings_err=False):
    if settings_err:settings(p);modal(p,'Настройки не подтверждены','Повторите запись или вернитесь к сохранённым настройкам.',[('Повторить сохранение',True),('Вернуться к сохранённому',False)],'warning')
    else:result(p,pending=True);modal(p,'Результат ещё не сохранён','Результат ещё не сохранён. Повторите сохранение выше.',[('Повторить сохранение',True),('Перечитать сохранение',False)],'warning')

def confirm(p):
    game(p);modal(p,'Начать новую игру?','Текущее прохождение, ресурсы и улучшения будут удалены. Настройки сохранятся.',[('Отмена',True),('Начать заново',False)],'warning')

def command(p):
    battle(p);w=p.w;ww=min(275,w-22);x=w-ww-8;y=104
    p.tile('panel-normal',x,y,ww,177)
    p.icon('cannon',x+11,y+11);p.txt('Пушка #1',x+38,y+13,ww-50,18,GOLD,'label')
    p.txt('49 / 70 HP',x+13,y+46,ww-26,14,MUTED)
    p.btn('',x+ww-45,y+6,37,34,icon='close',mini=True)
    p.btn('Указать врага',x+10,y+76,ww-20,43,icon='aim')
    p.btn('Сбросить в авто',x+10,y+127,ww-20,38,mini=True)

SCENES={
'game-select':game,'game-select-empty':lambda p:game(p,True),'settings':settings,
'chronicle':chronicle,'chronicle-index':lambda p:chronicle(p,index=True),'trials':lambda p:chronicle(p,trials=True),
**{f'story-{i+1:02}':(lambda p,i=i:story(p,i)) for i in range(7)},
'story-replay':lambda p:story(p,0,True),'preparation':preparation,'placement-invalid':lambda p:preparation(p,True),
'device-inventory':device,'development':develop,'purchase':lambda p:develop(p,True),'purchase-insufficient':lambda p:develop(p,True,True),
'collection':collection,'battle':battle,'battle-command':command,'pause':pause,'abandon-confirm':lambda p:pause(p,True),
'victory':result,'defeat':lambda p:result(p,False),'epilogue':end,'reset-confirm':confirm,'save-error':err,'settings-error':lambda p:err(p,True)}

