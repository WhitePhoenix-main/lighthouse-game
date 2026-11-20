"""Story entry and result layouts. Narrative comes directly from the live chapter catalogue."""
import json,re
from PIL import ImageDraw
from kit import ROOT, GAME
from front import rail, dialog

SCREENS={**{f"intro-{i}":f"Вступление · глава {i}" for i in range(1,8)},
        "intro-replay":"Повтор вступления","victory":"Победа","defeat":"Поражение",
        "epilogue":"Эпилог · победа над Сердцем тумана","result-error":"Ошибка записи результата"}
ROMAN=("I","II","III","IV","V","VI","VII")
CHAPTERS=list(zip(re.findall("introId: '[^']+', title: '([^']+)'", (GAME/"src/content/campaignFoundationDraft.ts").read_text(encoding="utf8")),
                ("Misty Shore","Far Shore","Thorn Marsh","Ashen Cliffs","Ship Graveyard","Avalon Eclipse","Last Dawn")))
TEXT=re.findall(r"^    '(.+)',$",(GAME/"src/content/campaignIntros.ts").read_text(encoding="utf8"),re.M)
assert len(CHAPTERS)==7 and len(TEXT)==14

def header(ui,x,y,w,num):
    ui.icon("book",x,y)
    ui.text(x+23,y+1,(f"Глава {num}",f"Chapter {num}"),13,"gold")
    rail(ui,x,y+24,w)

def story(ui,slug):
    replay=slug=="intro-replay";i=0 if replay else int(slug[6:])-1
    name=CHAPTERS[i];copy=TEXT[2*i:2*i+2]
    if ui.p:
        ui.hero(f"intro-{i+1}",0,0,ui.w,238,centering=(.85 if i==0 else .5,.5))
        x,y,w=21,259,ui.w-42
        header(ui,x,y,w,ROMAN[i]);ui.text(x,y+39,name,24)
        ui.wrap(x,y+85,w,copy,15)
        yy=ui.h-(73 if replay else 122)
    else:
        split=ui.w*55//100
        ui.hero(f"intro-{i+1}",0,0,split,245,centering=(.85 if i==0 else .5,.5))
        rail(ui,10,246,split-20)
        header(ui,19,260,split-38,ROMAN[i]);ui.text(19,305,name,23)
        x,y,w=split+17,24,ui.w-split-33
        ui.icon("book",x,y);rail(ui,x+23,y+9,w-23)
        ui.wrap(x,y+35,w,copy,15)
        yy=ui.h-(67 if replay else 113)
    ui.button(x,yy,w,44,("К Хронике","Back to Chronicle") if replay else ("Продолжить","Continue"),"primary","back" if replay else "play")
    if not replay:ui.button(x,yy+47,w,43,("Пропустить вступление","Skip intro"))

def result(ui,slug):
    finale=slug=="epilogue";lost=slug=="defeat";failed=slug=="result-error"
    night=("Сердце тумана","Heart of the Mist") if finale else ("Первый свет","First Light")
    title=("Рассвет Авалона","Avalon's Dawn") if finale else ("Свет погас.","The Light Went Out.") if lost else ("До рассвета.","Until Dawn.")
    copy=(("Туман отступил. Семь маяков встретили рассвет, и корабли снова видят путь домой.","The mist has lifted. Seven lighthouses greet the dawn, and ships can find their way home.")
          if finale else ("Маяк разрушен. Попробуй раньше переключаться между угрозами.","The lighthouse fell. Try switching targets sooner.")
          if lost else ("Маяк выстоял. Берег снова принадлежит тебе.","The lighthouse survived. The shore is yours again."))
    hero="finale" if finale else "storm" if lost else "harbor"
    if ui.p:
        ui.hero(hero,0,0,ui.w,144,centering=(.5,.2 if not lost else .5))
        x,by=17,155;ledger=(10,247,340,210)
        actions=(12,472,336)
    else:
        split=ui.w//2-16
        ui.hero(hero,0,0,split,169)
        rail(ui,7,169,split-14)
        x,by=15,181
        ledger=(split+6,8,ui.w-split-14,205)
        actions=(split+10,219,ui.w-split-22)
    ui.text(x,by,(night[0]+" / ИТОГ",night[1]+" / RESULT"),11,"gold")
    ui.text(x,by+20,title,23)
    end=ui.wrap(x,by+52,(ui.w-32 if ui.p else split-28),copy,12,"muted")
    if ui.p:
        top=max(ledger[1],end+5)
        ledger=(10,top,340,465-top)
    lx,ly,lw,lh=ledger
    ui.panel(lx,ly,lw,lh)
    stats=json.loads((ROOT/"source"/"outcomes.json").read_text(encoding="utf8"))["finale" if finale else "defeat" if lost else "victory"]
    rows=[(("Уничтожено","Defeated"),str(stats["kills"])),(("За существ","Enemy Rewards"),"+"+str(stats["resources"])),
          (("За досрочные волны","Early Wave Rewards"),"+"+str(stats["bonus"])),(("За спасение корабля","Ship Rescue Reward"),"+0"),
          (("За победу","Victory reward"),"+"+str(stats["victoryReward"]))]
    for i,(label,val) in enumerate(rows):
        yy=ly+13+i*21
        ui.text(lx+16,yy,label,12,"muted")
        ui.text(lx+lw-19,yy,val,13,"ink","rt")
    rail(ui,lx+13,ly+121,lw-26)
    ui.text(lx+16,ly+131,("Итого","Total"),18)
    ui.icon("coin",lx+lw-82,ly+130)
    ui.text(lx+lw-17,ly+129,"+"+str(stats["total"]),20,"gold","rt")
    if finale:
        ui.icon("pearl",lx+16,ly+155);ui.text(lx+39,ly+157,("Жемчуг глубин +4","Depth Pearls +4"),12,"cyan")
    if failed:
        ui.text(lx+15,ly+lh-25,("Результат ещё не сохранён.","Result not saved yet."),12,"red")
    else:
        ui.icon("check",lx+15,ly+lh-29)
        ui.text(lx+35,ly+lh-27,("Результат сохранён на этом устройстве","Result saved on this device"),11,"cyan")
    ax,ay,aw=actions
    first=("Подготовка к повтору","Prepare to replay") if finale or lost else ("Следующая ночь · Разбитый берег","Next night · Broken Shore")
    ui.button(ax,ay,aw,44,first,"disabled" if failed else "primary","play")
    if lost or finale:ui.button(ax,ay+47,aw,40,("Коллекция","Collection"),"secondary","book")
    else:
        half=aw//2
        ui.button(ax,ay+47,half-2,40,("Подготовка к повтору","Prepare for Replay"),"secondary")
        ui.button(ax+half+2,ay+47,aw-half-2,40,("Коллекция","Collection"),"secondary","book")
    if ui.p:
        rail(ui,15,ui.h-59,ui.w-30);nx,ny,nw=13,ui.h-52,ui.w-26
    else:nx,ny,nw=9,ui.h-54,split-16
    labels=[(("Главное меню","Main Menu"),"back"),(("Развитие маяка","Upgrades"),"tree"),(("Настройки","Settings"),"gear")]
    sizes=[int(nw*.32),int(nw*.34)]
    for i,(label,icon) in enumerate(labels):
        bw=sizes[i] if i<2 else nw-sum(sizes)
        ui.button(nx,ny,bw-1,44,label,"tab",None)
        nx+=bw
    if failed:
        dialog(ui,"repair",("Ошибка сохранения","Save error"),
               ("Результат ещё не сохранён. Повторите сохранение.","Result not saved yet. Retry saving."),
               [(("Повторить сохранение","Retry Save"),"primary"),(("Перечитать сохранение","Reload Save"),"secondary")])

def draw(ui,slug):
    if slug.startswith("intro-"):story(ui,slug)
    else:result(ui,slug)

