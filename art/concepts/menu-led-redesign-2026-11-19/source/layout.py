"""Layout in integer pixels; all labels and actions remain separate from the sprites."""
import math
import re
import os
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont, ImageOps
from assets import *

content=(REPO/'src/presentation/shared/localization.ts').read_text(encoding='utf8')
TRANSLATE={a:b for a,b in re.findall(r'^([^|\n]+)\|([^\n]+)$',content,re.M)}
TRANSLATE.update(dict(line.split('|',1) for line in '''
Выбор игры|Choose game
Настройки|Settings
Продолжить|Continue
Новая игра|New game
Испытания|Trials
Звук|Sound
Звуки|Effects
Музыка|Music
Язык|Language
Текст|Text
Обычный|Normal
Крупный|Large
Вкл|On
Выкл|Off
Авто|Auto
Русский|Russian
Назад|Back
Коллекция|Collection
Глава|Chapter
Глава I|Chapter I
Главы|Chapters
Развитие кампании|Campaign upgrades
Доступные|Available
Все|All
Пушки|Cannons
Ширина I|Width I
Дальность I|Range I
Мощность I|Power I
Мощность II|Power II
Купить|Buy
Урон в секунду|Damage per second
Требования|Prerequisites
Куплено|Purchased
К подготовке|To preparation
Пушка|Cannon
Световая ловушка|Light trap
Не хватает осколков|Missing shards
Мои устройства|My devices
На поле|Deployed
В запас|Store
Ремонт|Repair
Перезарядить|Recharge
Закрыть|Close
Заряды|Charges
Базовая|Basic
Вспышка|Flash
Бой|Battle
Волна|Wave
Цели|Targets
Устройства|Devices
Начать ночь|Start night
Пауза|Pause
Тихая минута.|A quiet moment.
Прервать ночь…|Interrupt night…
До рассвета.|Until dawn.
Свет погас.|The light went out.
До рассвета|Until dawn
Разбитый берег|Shattered Shore
Подготовка к повтору|Prepare to replay
Следующая ночь|Next night
Свет Авалона|Light of Avalon
Рассвет Авалона|Dawn of Avalon
Коллекция|Collection
Маяк рассвета|Dawn beacon
Осадная пушка|Siege cannon
Дальний гарпун|Long-range harpoon
Бронзовые устройства|Bronze devices
Лунный луч|Moonbeam
Медно-золотая отделка маяка. Меняет внешний вид.|Copper and gold trim for the lighthouse. Cosmetic only.
Применить|Equip
Осколки|Shards
Доступно|Available
Путь открыт|Available
Уничтожено|Destroyed
Итого|Total
За существ|For creatures
За победу|For victory
За досрочные волны|For early waves
За спасение корабля|For rescuing the ship
Результат сохранён на этом устройстве|Result saved on this device
Начать заново|Start over
Прервать эту ночь?|Interrupt this night?
Остаться в паузе|Stay paused
Прервать → подготовка|Interrupt → preparation
Прервать → главное меню|Interrupt → main menu
Начать новую игру?|Start a new game?
Отмена|Cancel
Перечитать сохранение|Reload saved profile
Повторить сохранение|Retry save
Вызвать волну|Call wave
Линза|Lens
Сила света|Light power
Урон|Damage
Купить · 45|Buy · 45
Волны 2 / 4|Waves 2 / 4
В свете 2 / 2|In light 2 / 2
Отбито 1|Cleared 1
Ближайший|Nearest
Открыт|Available
Итого · +403|Total · +403
Прочность|Health
Видеопредложения пока недоступны.|Video offers are currently unavailable.
Повторите запись или вернитесь к сохранённым настройкам.|Retry saving or return to saved settings.
Изучить · 45|Learn · 45
Ремонт · 2|Repair · 2
Перезарядить · 2|Recharge · 2
Связанный свет|Linked light
Ширина II|Width II
Ночь|Night
Смотреть вступление|Watch introduction
Сохранения нет|No saved game
К Хронике|Back to Chronicle
Главное меню|Main menu
Забрать награду|Claim reward
Все награды и новые встречи этой ночи будут потеряны. Устройства вернутся к состоянию перед началом ночи. Покупки и ремонт подготовки сохраняются.|This night’s rewards and new encounters will be lost. Devices will return to their starting condition. Preparation purchases and repairs will be kept.
Не удалось сохранить настройки.|Could not save settings.
Пропустить вступление|Skip intro
Результат ещё не сохранён|Result not saved yet
Прицелиться|Aim
В свете|In light
Завершено|Completed
Продолжить ночь|Resume night
Выберите узел|Select a node
Разведка|Scout
Объекты|Objects
Типы|Types
Цель недоступна|Invalid target
Без требований|No prerequisites
Результат ещё не сохранён. Повторите сохранение выше.|Result is not saved yet. Retry saving above.
К следующей ночи|Next night
Сведения о бое|Battle details
Обычный выстрел|Normal shot
Очки коллекции|Collection points
Дежурство приостановлено|Watch paused
Волны|Waves
Восстановить|Restore
'''.strip().splitlines()))
story=(REPO/'src/content/campaignIntros.ts').read_text(encoding='utf8')
JOURNAL=re.findall(r"^\s*'([^']+)',$",story,re.M)
for i in range(0,14,2):TRANSLATE[JOURNAL[i]]=JOURNAL[i+1]
CHAPTERS=re.findall(r"title: '([^']+)'",(REPO/'src/content/campaignFoundationDraft.ts').read_text(encoding='utf8'))[:7]
MISSING=set()
def tr(s,lang):
    if lang=='ru' or not re.search('[А-Яа-яЁё]',s):return s
    if s in TRANSLATE:return TRANSLATE[s]
    # Substance and numbers are composed separately where possible.
    for a in sorted(TRANSLATE,key=len,reverse=True):
        if s.startswith(a+' ') and not re.search('[А-Яа-яЁё]',s[len(a):]):return TRANSLATE[a]+s[len(a):]
    MISSING.add(s);return s

@lru_cache
def font(role,size):
    source=REPO/'public/fonts/menu/VollkornSC-Regular.ttf' if role in ('title','label','action') else Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts/segoeui.ttf'
    return ImageFont.truetype(str(source),size)

def fit_art(img,w,h,focus=.50):
    return ImageOps.fit(img,(w,h),method=NEAR,centering=(focus,.5)).convert('RGBA')

class Page:
    def __init__(self,w,h,lang='ru',large=False):
        self.im=Image.new('RGBA',(w,h),INK);self.w=w;self.h=h;self.p=h>w;self.lang=lang;self.large=large
        self.d=ImageDraw.Draw(self.im);self.notes=[];self.controls=[];self.issues=[]
    def tile(self,key,x,y,w,h):
        self.im.alpha_composite(nine(key,int(w),int(h)),(int(x),int(y)))
    def paste(self,img,x,y):
        self.im.alpha_composite(img.convert('RGBA'),(int(x),int(y)))
    def icon(self,key,x,y,zoom=1):
        im=SPRITES['icon-'+key]
        self.paste(im if zoom==1 else im.resize((19*zoom,19*zoom),NEAR),x,y)
    def shade(self,rect,color=INK,opacity=155):
        x,y,w,h=rect;a=Image.new('RGBA',(int(w),int(h)),color);a.putalpha(opacity);self.paste(a,x,y)
    def scenic(self,index=0,opacity=114):
        self.paste(fit_art(VISTAS[index],self.w,self.h,.56),0,0);self.shade((0,0,self.w,self.h),INK,opacity)
    def txt(self,s,x,y,w,size=15,color=TEXT,role='body',align='left',lines=1,height=None,translate=True):
        s=tr(str(s),self.lang) if translate else str(s)
        if not s:return 0
        if role=='action':s=s.upper()
        # Vollkorn SC lacks arrow/currency glyphs. Use the body face for mixed symbols.
        if '→' in s or '◈' in s:role='body'
        intended=round(size*(1.12 if self.large else 1))
        # Break only on word boundaries. Narrow captions are allowed to wrap.
        chosen=None
        for fs in range(intended,max(10,intended-4)-1,-1):
            f=font(role,fs); chunks=[];line=''
            for word in s.split():
                add=(line+' '+word).strip()
                if line and f.getlength(add)>w:chunks.append(line);line=word
                else:line=add
            if line:chunks.append(line)
            heights=[f.getbbox(a)[3]-f.getbbox(a)[1] for a in chunks]
            lead=fs+3; total=(len(chunks)-1)*lead+max(heights[-1:],default=0)
            if len(chunks)<=lines and max((f.getlength(a) for a in chunks),default=0)<=w and (height is None or total<=height):
                chosen=(f,chunks,lead,total);break
        if chosen is None:
            self.issues.append(('text-fit',s,w,height));chosen=(f,chunks,lead,total)
        f,chunks,lead,total=chosen
        for i,line in enumerate(chunks):
            bb=f.getbbox(line);width=bb[2]-bb[0];left=int(x+(w-width)*({'center':.5,'right':1}.get(align,0)))
            top=int(y+i*lead)
            if min(left,top)<0 or left+width>self.w+1 or top+bb[3]-bb[1]>self.h+1:self.issues.append(('outside',s,left,top))
            if role=='title':self.d.text((left-bb[0]+1,top-bb[1]+2),line,font=f,fill=INK)
            if role in ('action','title'):
                self.d.text((left-bb[0]+1,top-bb[1]+1),line,font=f,fill='#895931',stroke_width=1,stroke_fill=INK)
                self.d.text((left-bb[0],top-bb[1]),line,font=f,fill=color,stroke_width=1 if role=='action' and f.size>=17 else 0,stroke_fill='#d99c66')
            else:self.d.text((left-bb[0],top-bb[1]),line,font=f,fill=color)
        self.notes.append(s);return total
    def btn(self,s,x,y,w,h=38,state='normal',icon=None,mini=False):
        self.controls.append((s,x,y,w,h))
        key=('tab-'+('selected' if state in ('selected','hover') else state)) if mini else 'button-'+state
        self.tile(key,x,y,w,h)
        if icon:
            if s:self.icon(icon,x+10,y+(h-19)//2)
            else:self.icon(icon,x+(w-19)//2,y+(h-19)//2)
        if s:
            left=x+(33 if icon else 7);avail=w-(40 if icon else 14)
            size=14 if mini else 16 if h<44 or w<150 else 21
            fs=round(size*(1.12 if self.large else 1));top=y+(h-fs)//2+1
            self.txt(s,left,top,avail,size,(MUTED if state=='disabled' else GOLD if not mini or state=='selected' else TEXT),'label' if mini or state=='disabled' or (w<195 and len(s)>10) else 'action','center')
    def header(self,title,eye='',back=True):
        w=self.w;self.shade((0,0,w,57),INK,234)
        self.d.line((0,56,w,56),fill=EDGE)
        if back:self.btn('',10,8,40,40,icon='back',mini=True)
        x=61 if back else 16
        if eye:self.txt(eye,x,6,w-x-10,12,MUTED)
        self.txt(title,x,23 if eye else 16,w-x-12,20 if self.p else 24,GOLD,'title')
    def art(self,i,x,y,w,h):
        self.paste(fit_art(VISTAS[i],w,h),x,y)
        self.d.rectangle((x,y,x+w-1,y+h-1),outline=EDGE)
    def div(self,x,y,w):
        self.d.line((x,y,x+w-1,y),fill='#4a5360')
    def meter(self,x,y,w,key,value):
        self.paste(SPRITES['meter-empty'].resize((w,6),NEAR),x,y)
        if value>0:self.paste(SPRITES['meter-'+key].resize((max(2,round(w*value)),6),NEAR),x,y)
    def rows(self,items,x,y,w,step=29,color=TEXT):
        for i,(a,b) in enumerate(items):
            self.txt(a,x,y+i*step,w-58,14,color)
            self.txt(b,x+w-62,y+i*step,62,15,GOLD,'label','right')
            self.div(x,y+(i+1)*step-6,w)

