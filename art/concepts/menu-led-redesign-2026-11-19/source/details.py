"""Additional views of live gameplay systems and the separate prototype tree."""
from states import *

def graph(p):
    w,h=p.w,p.h;p.scenic(0,228);p.header('Древо улучшений')
    p.btn('Маяк',10,65,132,35,'selected',icon='beacon',mini=True)
    p.btn('Линзы',148,65,116,35,icon='lens',mini=True)
    # Independent root nodes and a real two-parent dependency from UPGRADES.
    nodes=['Мощность I','Ширина I','Мощность II','Ширина II','Связанный свет']
    ic=['check','lens','flash','lock','lock'];state=['normal','selected','normal','disabled','disabled']
    if p.p:
        nw=(w-30)//2;nh=58
        pos=[(10,140),(w-nw-10,140),(10,290),(w-nw-10,290),((w-nw)//2,418)]
    else:
        nw=151;nh=46;mid=w//2
        pos=[(mid-235,121),(mid+84,121),(15,243),(w-15-nw,243),(mid-nw//2,243)]
    for a,b in [(0,2),(1,3),(0,4),(1,4)]:
        sx,sy=pos[a];ex,ey=pos[b];sx+=nw//2;sy+=nh;ex+=nw//2
        middle=(240 if p.p else 190) if b==4 else (sy+ey)//2
        p.d.line([(sx,sy),(sx,middle),(ex,middle),(ex,ey)],fill='#8197a5' if a==0 else '#997052',width=2)
        p.d.polygon([(ex-3,ey-5),(ex+3,ey-5),(ex,ey-1)],fill=GOLD)
    for i,((x,y),name) in enumerate(zip(pos,nodes)):
        p.tile('tab-'+state[i],x,y,nw,nh);p.icon(ic[i],x+(nw-19)//2,y+4)
        p.txt(name,x+6,y+25,nw-12,15,PAPER if i<3 else MUTED,'label','center')
    y=h-57;p.shade((0,y-3,w,60),INK,238);p.txt('Ширина I',12,y+8,w//2-12,18,GOLD,'label')
    p.txt('Доступно для изучения',12,y+34,w//2-11,12,TEAL)
    p.btn('Изучить · 45',w//2+5,y+6,w//2-15,40,icon='shard')

def campaign_list(p):
    w,h=p.w,p.h;p.scenic(0,220);p.header('Развитие кампании')
    tabs=['Все','Доступные','Маяк','Устройства','Линзы','Способности']
    if p.p:tabs=tabs[:3]
    bw=(w-13)//len(tabs);x=6
    for i,s in enumerate(tabs):
        tw=bw+(18 if i==5 else -18 if i==0 and not p.p else 0);p.btn(s,x,66,tw-3,35,'selected' if i==0 else 'normal',mini=True);x+=tw
    p.txt('Сила света',13,113,w-130,19,GOLD,'title');p.icon('shard',w-101,111);p.txt('80',w-76,114,28,15,PAPER)
    p.icon('pearl',w-49,111);p.txt('0',w-23,114,18,15,PAPER)
    data=[('Мощность I','45','flash',True),('Мощность II','80','lock',False),('Ширина I','45','lens',True),('Ширина II','80','lock',False)]
    for i,(s,price,ic,available) in enumerate(data):
        if p.p: x=10;yy=143+i*94;ww=w-20;hh=82
        else: x=11+(i%2)*((w-18)//2);yy=143+(i//2)*94;ww=(w-31)//2;hh=82
        p.tile('tab-'+('selected' if i==0 else 'normal'),x,yy,ww,hh)
        p.icon(ic,x+13,yy+13);p.txt(s,x+40,yy+12,ww-53,18,PAPER,'label')
        p.txt('Доступно' if available else 'Закрыто',x+15,yy+48,ww-90,14,TEAL if available else MUTED)
        p.icon('shard',x+ww-62,yy+44);p.txt(price,x+ww-36,yy+48,26,14,GOLD)
    if p.p:p.btn('Линзы',10,h-62,(w-34)//2,40,icon='lens',mini=True);p.btn('Способности',w//2,h-62,(w-22)//2,40,mini=True)
    else:p.txt('Оптика',13,h-25,w-26,16,MUTED,'label')

def ledger(p):
    # Replay: 80 scheduled enemies and two zero-reward scavengers from the golem.
    # All eight waves cleared on schedule. The boss is separate from enemy kills.
    w,h=p.w,p.h;p.scenic(7,214);p.header('Рассвет Авалона','Сердце тумана')
    sx=12 if p.p else w//2+3;sy=72;sw=w-sx-14
    if not p.p:
        p.art(7,12,74,sx-34,113);p.txt('Туман отступил. Семь маяков встретили рассвет, и корабли снова видят путь домой.',16,203,sx-40,16,TEXT,lines=5)
        p.btn('Коллекция',12,h-58,sx-35,44,icon='bag')
    else:p.art(7,12,72,sw,112);sy=202
    p.rows([('Уничтожено','82'),('За существ','+108'),('За досрочные волны','+0'),('За спасение корабля','+0'),('За победу','+295'),('Итого','+403')],sx,sy,sw,26)
    p.icon('check',sx,sy+161);p.txt('Результат сохранён на этом устройстве',sx+24,sy+163,sw-25,13,TEAL,lines=3)
    p.btn('Подготовка к повтору',sx,sy+199,sw,43)
    p.btn('Главное меню',sx,sy+247,sw,36,icon='back',mini=True)
    if p.p:p.btn('Коллекция',sx,h-57,sw,40,icon='bag',mini=True)

def prep_drawer(p,which):
    preparation(p)
    if which=='recon':
        modal(p,'Разведка','Поворачивайте луч заранее. Броня черепахи сохраняет повреждения после переключения.',[('Закрыть',True)],'aim')
        x,y,w,h=p.modal;p.txt('4',x+18,y+h-92,22,16,GOLD);p.txt('Волны',x+43,y+h-92,w-62,15,PAPER)
    elif which=='lens':
        modal(p,'Линза','Ровный свет без компромиссов.',[('Базовая',True),('Закрыть',False)],'lens')
    elif which=='ability':
        modal(p,'Способность','Способность применяется во время боя.',[('Вспышка',True),('Закрыть',False)],'flash')
    elif which=='shards':
        modal(p,'Осколки','Видеопредложения пока недоступны.',[('Закрыть',True)],'shard')
    else:
        modal(p,'Световая ловушка','',[],icon='gear',custom=True)
        x,y,w,h=p.modal;aw=w-40
        p.rows([('Прочность','15 / 30'),('Заряды','0 / 1')],x+20,y+66,aw)
        for i,(a,primary) in enumerate([('Ремонт · 2',False),('Перезарядить · 2',True),('Закрыть',False)]):
            p.btn(a,x+15,y+145+i*44,w-30,39,icon='shard' if i<2 else None,mini=not primary)

def boss(p):
    battle(p);w,h=p.w,p.h;cx=round(w*(.58 if p.p else .57));cy=round(h*(.52 if p.p else .60))
    width=w-19 if p.p else 283;x=9 if p.p else w//2-width//2
    p.tile('panel-normal',x,63,width,47);p.txt('Страж глубин',x+12,70,width-100,16,PAPER,'label')
    p.txt('271 / 420',x+width-92,71,78,14,GOLD,'body','right');p.meter(x+11,94,width-22,'danger',271/420)
    for i,(dx,dy) in enumerate([(49,-19),(52,48),(77,18)]):
        xx=cx+dx;yy=cy+dy;t=SPRITES['world-tentacle'];p.paste(t,xx-14,yy-37)
        if i==1:
            p.icon('warning',xx-9,yy-60);p.d.ellipse((xx-20,yy-5,xx+20,yy+4),outline=RED,width=2)

SCENES.update({'battle-boss':boss,'skill-tree':graph,'development':campaign_list,'epilogue-result':ledger,
               'recon':lambda p:prep_drawer(p,'recon'),'lens':lambda p:prep_drawer(p,'lens'),
               'ability':lambda p:prep_drawer(p,'ability'),'currency-unavailable':lambda p:prep_drawer(p,'shards'),
               'trap-service':lambda p:prep_drawer(p,'trap')})

