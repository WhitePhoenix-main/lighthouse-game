"""Static screen compositions using the shared menu-led kit."""
from layout import *
from PIL import ImageEnhance
import random

def game(p,blank=False):
    w,h=p.w,p.h
    p.paste(fit_art(VISTAS[0],w,h,.64),0,0)
    if p.p:
        p.shade((0,h-324,w,324),INK,229);x=(w-240)//2;y=h-240
        p.txt('Свет Авалона',14,h-311,w-28,13,MUTED,'label','center')
        p.txt('Выбор игры',14,h-285,w-28,30,GOLD,'title','center')
    else:
        x=21;y=120
        for i in range(0,355,2):p.shade((i,0,2,h),INK,max(0,227-i//2))
        p.txt('Свет Авалона',x+7,28,250,14,PAPER,'label')
        p.txt('Выбор игры',x+6,57,280,33,GOLD,'title')
    for i,(s,state) in enumerate([('Продолжить','disabled' if blank else 'normal'),('Новая игра','normal'),('Испытания','disabled')]):
        p.btn(s,x,y+i*53,240,48,state,icon='lock' if state=='disabled' else None)
    if blank:p.txt('Сохранения нет',x,y+160,240,13,MUTED,'body','center')
    p.btn('Назад',x+58,min(h-48,y+187),124,36,icon='back',mini=True)

def settings(p):
    p.scenic(0,163);p.header('Настройки')
    x=12 if p.p else (p.w-476)//2; w=p.w-24 if p.p else 476
    top=83 if p.p else 68;height=477 if p.p else 279
    p.tile('panel-normal',x,top,w,height)
    rows=[('Звук',['Вкл','Выкл']),('Музыка',70),('Звуки',80),('Язык',['Авто','Русский','English']),('Текст',['Обычный','Крупный'])]
    for i,(title,data) in enumerate(rows):
        yy=top+17+i*(92 if p.p else 51);p.txt(title,x+14,yy+(0 if p.p else 8),w-28 if p.p else 115,17,PAPER,'label')
        xx=x+14 if p.p else x+128; cy=yy+22 if p.p else yy-3; avail=w-(28 if p.p else 143)
        if isinstance(data,list):
            bw=(avail-(len(data)-1)*4)//len(data)
            selected=(1 if title=='Текст' and p.large else 2 if title=='Язык' and p.lang=='en' else 0)
            for j,s in enumerate(data):p.btn(s,xx+j*(bw+4),cy,bw,40 if p.p else 37,'selected' if j==selected else 'normal',mini=True)
        else:
            track=avail-53;p.meter(xx,cy+15,track,'light',data/100)
            p.icon('shard',xx+round(track*data/100)-9,cy+8);p.txt(f'{data}%',xx+track+4,cy+8,47,16,PAPER,'label','right')
        if i<4:p.div(x+14,yy+(71 if p.p else 39),w-28)

def story(p,index,replay=False):
    w,h=p.w,p.h;p.scenic(index,206)
    if p.p:
        p.art(index,8,9,w-16,205);x=19;y=235;aw=w-38
    else:
        p.art(index,0,0,w,150);x=27;y=160;aw=w-54
    p.txt(f'Глава {index+1}',x,y,aw,13,MUTED,'label')
    p.txt(CHAPTERS[index],x,y+24,aw,23 if p.p else 28,GOLD,'title')
    p.div(x,y+60,aw)
    p.txt(JOURNAL[index*2+(1 if p.lang=='en' else 0)],x,y+73,aw,16,TEXT,lines=9 if p.p else 3,translate=False,height=h-88-y-64)
    if p.p:
        p.btn('К Хронике' if replay else 'Продолжить',(w-240)//2,h-(67 if replay else 114),240,48)
        if not replay:p.btn('Пропустить вступление',(w-240)//2,h-59,240,42,mini=True)
    else:
        if not replay:p.btn('Пропустить вступление',x,h-52,210,40,mini=True)
        p.btn('К Хронике' if replay else 'Продолжить',w-267,h-58,240,48)

def chronicle(p,trials=False,index=False):
    w,h=p.w,p.h;p.scenic(1 if trials else 0,215)
    p.header('Испытания' if trials else 'Хроника маяка')
    if p.p:
        artx=10;arty=68;artw=w-20;arth=124
        x=11;y=211;rw=w-22
    else:
        artx=12;arty=72;artw=int(w*.40)-20;arth=150
        x=artw+40;y=73;rw=w-x-14
    p.art(7 if trials else 0,artx,arty,artw,arth)
    if not p.p:
        p.txt('Испытание' if trials else 'Глава I',artx+3,arty+arth+9,artw-6,13,MUTED)
        p.txt('Сигнал бедствия' if trials else CHAPTERS[0],artx+3,arty+arth+28,artw-6,21,GOLD,'title')
        p.btn('Главы' if not trials else 'Назад',artx, h-52, min(artw,150),39,icon='book' if not trials else 'back',mini=True)
    else:
        p.shade((artx,arty+arth-28,artw,28),INK,200)
        p.txt('Испытания' if trials else CHAPTERS[0],artx+10,arty+arth-24,artw-20,17,GOLD,'label')
    p.tile('parchment-normal',x,y,rw,(h-61 if p.p else h-62)-y)
    heading='Испытания' if trials else 'Главы' if index else 'Ночь'
    p.txt(heading,x+14,y+13,rw-28,19,'#543a30','label')
    items=(['Сигнал бедствия','Броневой фронт','Воздушный налёт','Смешанный штурм'] if trials else CHAPTERS[:4] if index else ['Первый свет','Разбитый берег','Крылатый прилив','Обратный прилив'])
    step=61 if p.p else 41
    for i,s in enumerate(items):
        yy=y+45+i*step
        if i==0:p.d.rectangle((x+10,yy-4,x+rw-12,yy+step-9),fill='#e9c99a',outline='#96623f',width=1)
        p.icon('check' if i==0 and not trials and not index else 'diamond' if i==0 or (i==1 and not trials and not index) else 'lock',x+17,yy+2)
        p.txt(s,x+42,yy+3,rw-57,18,'#302c30','label')
        if p.p:p.txt('Выбрано' if i==0 else 'Доступно' if i==1 and not trials and not index else 'Закрыто',x+44,yy+28,rw-58,13,'#513f38')
        else:p.d.line((x+45,yy+30,x+rw-18,yy+30),fill='#ae8b65')
    bottom=y+45+4*step+(3 if p.p else -8)
    if p.p:
        p.btn('Главы' if not trials else 'Назад',x+8,h-49,82,38,mini=True)
    if not trials:
        p.txt('1 / 2',x+12,bottom,rw-64,13,'#513f38','body','right');p.icon('next',x+rw-37,bottom-3)
    if not p.p and not trials and not index:p.btn('Смотреть вступление',artx,270,artw,33,mini=True)
    p.btn('К подготовке',w-(184 if p.p else 236),h-51,172 if p.p else 220,41)

def world(p,battle=False,invalid=False):
    w,h=p.w,p.h; seed=random.Random(6)
    lighthouse=(round(w*(.58 if p.p else .57)),round(h*(.52 if p.p else .60)))
    cx,cy=lighthouse; shore=[]
    raw=(REPO/'src/content/terrain.ts').read_text(encoding='utf8').split('SHORELINE_SOURCE_PIXELS:')[1].split('= [')[1].split('];')[0]
    pairs=[(int(a),int(b)) for a,b in re.findall(r'\[(\d+),(\d+)\]',raw)]
    # World origin is at source (768,512); projection of the headland profile.
    zoom=.64 if not p.p else .60
    for sx,sy in pairs:shore.append((round(cx+(sx-768)*zoom),round(cy+(sy-512)*zoom)))
    def coast(y):
        pts=[(yy,xx) for xx,yy in shore]
        if y<=pts[0][0]:return pts[0][1]
        for (y0,x0),(y1,x1) in zip(pts,pts[1:]):
            if y<=y1:return round(x0+(x1-x0)*(y-y0)/(y1-y0))
        return pts[-1][1]
    land=Image.new('L',(w,h));md=ImageDraw.Draw(land)
    outline=[(coast(y),y) for y in range(h)]; md.polygon([(0,0),*outline,(0,h-1)],fill=255)
    for k in ('sea','land'):
        surf=Image.new('RGBA',(w,h))
        tile=SPRITES['terrain-'+k]
        for y in range(0,h,360):
            for x in range(0,w,360):surf.paste(tile,(x,y))
        if k=='land':surf.putalpha(land)
        p.paste(surf,0,0)
    for off,col in [(5,'#355a77'),(3,'#102037'),(0,'#819095')]:p.d.line([(x+off,y) for x,y in outline],fill=col,width=2)
    # Several discontinuous foam crests separate cliff and water.
    for y in range(4,h,7):
        d=seed.randrange(8,18);x=coast(y);p.d.line([(x+d,y),(x+d-2,y+3),(x+d-3,y+4)],fill='#7297ae')
    cannon=(cx-32,cy+28)
    if not battle:
        for angle in range(0,360,4):
            a=math.radians(angle);xx=cx+int(math.cos(a)*(115 if p.p else 146));yy=cy+int(math.sin(a)*(82 if p.p else 100))
            p.d.line((xx,yy,xx+2,yy),fill='#ceac76')
    # Keep threats on two dry approaches, with a third outside the sector.
    beacon=ACTORS['beacon']; bx=cx-beacon.width//2; by=cy-beacon.height
    if battle:
        endx=cx-(116 if p.p else 180);endy=cy-(20 if p.p else 29)
        # Project the sector from the tower base; pinch light rays up to the lantern.
        lay=canvas(w,h);ld=ImageDraw.Draw(lay)
        ld.polygon([(cx,cy-57),(endx,endy-27),(endx-7,endy+19)],fill=(253,188,98,55))
        ld.line([(cx,cy-57),(endx,endy-27)],fill=(255,207,134,135));ld.line([(cx,cy-57),(endx-7,endy+19)],fill=(255,207,134,135));p.paste(lay,0,0)
        targets=[('ghost',cx-(100 if p.p else 151),cy-35,0.58,True),('turtle',cx-(70 if p.p else 103),cy-27,1,True),('ghost',cx-84,cy+62,1,False)]
        for kind,xx,yy,hp,lit in targets:
            a=ACTORS[kind];px=xx-a.width//2;py=yy-a.height//2
            if lit:
                alpha=ImageOps.expand(a.getchannel('A'),1).filter(ImageFilter.MaxFilter(3))
                halo=Image.new('RGBA',alpha.size,GOLD);halo.putalpha(alpha);p.paste(halo,px-1,py-1)
            p.paste(a,px,py);p.meter(xx-15,py-9,30,'health',hp)
            if kind=='turtle':p.meter(xx-15,py-15,30,'armor',.48)
    p.paste(beacon,bx,by);c=ACTORS['cannon'];p.paste(c,cannon[0]-c.width//2,cannon[1]-c.height)
    if invalid:
        xx=min(w-32,cx+63);yy=cy+35;p.d.ellipse((xx-20,yy-8,xx+20,yy+8),outline=RED,width=2);p.icon('close',xx-9,yy-15)
    return cx,cy

def preparation(p,invalid=False):
    w,h=p.w,p.h;world(p,invalid=invalid)
    p.header('Первый свет','Туманный берег')
    p.btn('',w-92,9,36,36,icon='book',mini=True);p.btn('',w-48,9,36,36,icon='tree',mini=True)
    p.btn('Разведка',10,65,118,35,icon='aim',mini=True)
    p.btn('',w-50,65,40,35,icon='bag',mini=True)
    if p.p:
        y=h-145;p.shade((0,y-10,w,155),INK,228); bw=(w-32)//3
        for i,(key,ic) in enumerate([('Устройства','cannon'),('Базовая','lens'),('Вспышка','flash')]):
            p.btn(key,5+i*(bw+8),y+4,bw+6,36,mini=True)
        p.txt('Расстановка и старт бесплатны',12,y+53,w-24,13,MUTED,'body','center')
        p.btn('Начать ночь',(w-240)//2,h-64,240,48,'disabled' if invalid else 'normal')
    else:
        y=h-61;p.shade((0,y-5,w,66),INK,227)
        for i,(key,ic) in enumerate([('Устройства','cannon'),('Базовая','lens'),('Вспышка','flash')]):p.btn(key,8+126*i,y,120,36,icon=ic,mini=True)
        p.txt('Расстановка и старт бесплатны',13,y+40,360,13,MUTED)
        p.btn('Начать ночь',w-244,y,232,48,'disabled' if invalid else 'normal')
    if invalid:
        yy=y-92 if p.p else y-69;ww=min(345,w-20);p.tile('panel-normal',10,yy,ww,84 if p.p else 64)
        p.txt('Устройство должно целиком находиться на суше.',21,yy+9,ww-24,14,RED,lines=2)
        p.btn('Отменить расстановку',18,yy+(43 if p.p else 29),ww-16,32,mini=True)

def battle(p):
    w,h=p.w,p.h;world(p,True)
    p.shade((0,0,w,58),INK,225);p.d.line((0,57,w,57),fill=EDGE)
    p.icon('beacon',8,12);p.txt('Маяк',32,7,68,13,PAPER);p.txt('98 / 120',32,25,77,16,TEXT,'label')
    p.meter(10,47,96,'health',98/120)
    nx=117 if p.p else w//2-62
    p.txt('Волны 2 / 4',nx,8,119,16,GOLD,'label')
    p.txt('00:42',nx,32,92,14,MUTED)
    p.btn('',w-49,9,38,38,icon='pause',mini=True)
    p.btn('',w-48,66,38,35,icon='cannon',mini=True)
    y=h-(106 if p.p else 53);p.shade((0,y,w,h-y),INK,229)
    if p.p:
        p.icon('lens',12,y+10);p.txt('Базовая',38,y+7,81,14,PAPER);p.txt('В свете 2 / 2',125,y+7,w-139,14,GOLD)
        bw=(w-24)//2;p.btn('Вспышка',8,y+46,bw,45,icon='flash');p.btn('Вызвать волну',16+bw,y+46,bw,45,mini=True)
    else:
        p.icon('lens',14,y+12);p.txt('Базовая',42,y+7,105,16,PAPER);p.txt('В свете 2 / 2',42,y+30,104,13,GOLD)
        p.btn('Вспышка',w//2-89,y+6,178,42,icon='flash');p.btn('Вызвать волну',w-186,y+6,176,42,mini=True)

