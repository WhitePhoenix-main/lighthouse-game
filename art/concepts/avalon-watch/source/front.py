"""Entry screens, persistence and irreversible-action dialogs."""
import math
import random
from PIL import Image,ImageDraw,ImageOps
from kit import C, N, hero_image, sprite

SCREENS={
 "game-menu":"Выбор игры", "game-menu-new":"Выбор игры · первый запуск",
 "confirm-new":"Подтверждение новой игры", "settings":"Настройки",
 "settings-error":"Ошибка сохранения настроек",
}

def rail(ui,x,y,w):
    d=ImageDraw.Draw(ui.im)
    d.line((x,y,x+w-1,y),fill="#89593f")
    d.line((x,y+1,x+w-1,y+1),fill="#502f28")
    for xx in (x+3,x+w-5):
        d.rectangle((xx,y-1,xx+2,y+2),fill="#bb8151");d.point((xx,y-1),fill="#ffe3ad")

def gateway():
    """A cut-stone window. Its transparent opening frames both the lamp and the sail."""
    im=Image.new("RGBA",(400,360),"#101e30");d=ImageDraw.Draw(im);rng=random.Random(34)
    for row in range(21):
        y=row*18-7
        for col in range(-1,12):
            x=col*44+row%2*22
            shade=rng.choice(["#213346","#243648","#26394c","#1d3043"])
            points=[(x+2,y+1),(x+39,y+1),(x+42,y+4),(x+41,y+15),(x+38,y+17),(x+3,y+16),(x,y+13)]
            d.polygon(points,fill=shade);d.line(points[:3],fill="#405061")
            for _ in range(10):
                xx=x+rng.randrange(3,38);yy=y+rng.randrange(4,15)
                d.line((xx,yy,xx+rng.randrange(1,5),yy),fill=rng.choice([shade,"#2e4255","#1d2e3e"]))
    for radius,color in ((203,"#0a1726"),(200,"#617079"),(197,"#3c4a59"),(184,"#1b2f42")):
        d.pieslice((200-radius,103-radius//3,200+radius,103+radius//3),180,360,fill=color)
    for j in range(1,18):
        ang=math.pi+j*math.pi/18
        d.line([(200+round(r*math.cos(ang)),103+round(r/3*math.sin(ang))) for r in (184,199)],fill="#182737",width=2)
    for x in (6,379):
        d.rectangle((x,103,x+14,263),fill="#364959")
        for y in range(103,263,21):
            d.line((x,y,x+14,y),fill="#70808a");d.line((x,y+19,x+14,y+19),fill="#172a3b")
    hole=(0,0,0,0)
    d.pieslice((21,46,379,160),180,360,fill=hole)
    d.rectangle((21,103,379,264),fill=hole)
    for i,(left,fill) in enumerate([(4,"#7c7c73"),(5,"#38495a"),(8,"#56616a"),(11,"#1b2a3a")]):
        d.rectangle((left,265+i*3,400-left,268+i*3),fill=fill)
    # A compass carved into the sill stone.
    for r,color in [(19,"#112336"),(17,"#706151"),(15,"#172c40")]:d.ellipse((200-r,313-r,200+r,313+r),fill=color)
    for j in range(8):
        a=j*math.pi/4;length=16 if j%2==0 else 9
        pt=lambda r,ang:(200+round(r*math.sin(ang)),313-round(r*math.cos(ang)))
        d.polygon([(200,313),pt(4,a-.8),pt(length,a)],fill="#b29b72")
        d.polygon([(200,313),pt(length,a),pt(4,a+.8)],fill="#615442")
    for x in (24,225):
        d.line((x,313,x+151,313),fill="#705840");d.line((x,314,x+151,314),fill="#263342")
    return im

def dim(ui):
    ui.im.alpha_composite(Image.new("RGBA",ui.im.size,(4,13,23,180)))

def dialog(ui,icon,title,body,options):
    dim(ui)
    width=min(ui.w-32,438)
    lines=1; line=""
    for word in ui.tr(body).split():
        candidate=(line+" "+word).strip()
        if line and ui.face(14).getlength(candidate)>width-44:
            lines+=1;line=word
        else:line=candidate
    title_lines=1 if ui.face(19).getlength(ui.tr(title))<=width-63 else 2
    extra=(title_lines-1)*(ui.face(19).size+4)
    height=65+extra+lines*(ui.face(14).size+4)+(45*len(options) if ui.p or len(options)>2 else 44)+30
    x=(ui.w-width)//2;y=(ui.h-height)//2
    ui.panel(x,y,width,height,"gold")
    ui.icon(icon,x+19,y+17)
    ui.wrap(x+43,y+17,width-63,title,19,"gold")
    rail(ui,x+18,y+49+extra,width-36)
    ui.wrap(x+22,y+63+extra,width-44,body,14)
    if ui.p or len(options)>2:
        for k,(label,style) in enumerate(options):
            ui.button(x+18,y+height-12-(len(options)-k)*45,width-36,43,label,style)
    else:
        half=(width-39)//2
        for k,(label,style) in enumerate(options):
            ui.button(x+16+k*(half+7),y+height-58,half,44,label,style)

def game_menu(ui,slug):
    empty=slug=="game-menu-new"
    if ui.p:
        ui.hero("harbor",0,0,ui.w,232)
        x,y,w=22,244,ui.w-44
        rail(ui,12,231,ui.w-24)
    else:
        cut=(ui.w*54)//100
        # Crop the masonry outside the arch as the viewport narrows.
        origin=(cut-400)//2
        window=Image.new("RGBA",(400,360))
        window.paste(ImageOps.fit(hero_image("harbor"),(374,227),method=N),(13,41))
        window.alpha_composite(sprite("gatehouse"))
        ui.im.alpha_composite(window.crop((-origin,0,cut-origin,360)),(0,0))
        x,y,w=cut+17,19,ui.w-cut-35
    ui.text(x,y,("Выбор игры","Choose game"),24,"gold")
    rail(ui,x,y+36,w)
    if empty:
        ui.wrap(x+3,y+49,w-4,("Сохранения пока нет. Начните новую игру.","No saved campaign yet. Start a new game."),13)
    else:
        ui.text(x+2,y+48,("Глава 1 · Туманный берег","Chapter 1 · Misty Shore"),14)
        ui.text(x+2,y+70,("Ночь 2 · Разбитый берег","Night 2 · Broken Shore"),13,"muted")
    for i,(label,style,icon) in enumerate([
            (("Продолжить","Continue"),"disabled" if empty else "primary","play"),
            (("Новая игра","New Game"),"primary" if empty else "secondary","light"),
            (("Испытания","Trials"),"disabled","lock")]):
        ui.button(x,y+99+i*49,w,46,label,style,icon)
    ui.button(x,y+(303 if ui.p else 270),w if ui.p else 118,44,("Назад","Back"),"secondary","back")
    if slug=="confirm-new":
        dialog(ui,"light",("Начать новую игру?","Start a new game?"),
               ("Текущее прохождение, ресурсы и улучшения будут удалены. Настройки сохранятся.",
                "Your current progress, resources and upgrades will be deleted. Settings will be kept."),
               [(("Отмена","Cancel"),"primary"),(("Начать заново","Start over"),"secondary")])

def settings(ui,slug):
    ui.hero("relic",0,0,ui.w,ui.h)
    ui.im.alpha_composite(Image.new("RGBA",ui.im.size,(5,17,32,206)))
    x=16 if ui.p else (ui.w-570)//2
    w=ui.w-2*x
    ui.icon("gear",x+5,22);ui.text(x+31,16,("Настройки","Settings"),24,"gold")
    rail(ui,x,53,w)
    back=("Назад","Back")
    if ui.p:
        audio=(x,67,w,235);reading=(x,317,w,211)
    else:
        split=(w-10)//2
        audio=(x,66,split,208);reading=(x+split+10,66,w-split-10,208)
    for bx,by,bw,bh in (audio,reading):ui.panel(bx,by,bw,bh)
    ax,ay,aw,ah=audio
    ui.text(ax+15,ay+15,("Звук","Sound"),18)
    ui.button(ax+aw-131,ay+7,57,37,("Вкл","On"),"selected")
    ui.button(ax+aw-73,ay+7,58,37,("Выкл","Off"),"tab")
    for i,(label,val) in enumerate([(("Музыка","Music"),50),(("Звуки","Sound Effects"),70)]):
        by=ay+65+i*(78 if ui.p else 66)
        ui.text(ax+17,by,label,15)
        ui.text(ax+aw-19,by,str(val)+"%",15,"gold","rt")
        track=aw-47;xx=ax+23;yy=by+31
        d=ImageDraw.Draw(ui.im)
        d.rectangle((xx,yy,xx+track,yy+3),fill="#0c1727")
        d.line((xx,yy,xx+track*val//100,yy),fill=C["copper"])
        for j in range(11):
            tick=xx+round(track*j/10);d.line((tick,yy+6,tick,yy+8+(j%5==0)*2),fill="#728392")
        ui.im.alpha_composite(sprite("slider-thumb"),(xx+track*val//100-5,yy-7))
    rx,ry,rw,rh=reading
    ui.text(rx+16,ry+15,("Язык","Language"),18)
    segment=(rw-26)//3
    for k,label in enumerate([("Авто","Auto"),("Русский","Русский"),("English","English")]):
        ui.button(rx+12+k*segment,ry+45,segment-1,39,label,"selected" if k==0 else "tab")
    ui.text(rx+16,ry+111,("Размер текста","Text size"),18)
    segment=(rw-26)//2
    for k,label in enumerate([("Обычный","Normal"),("Крупный","Large")]):
        ui.button(rx+12+k*segment,ry+142,segment-1,42,label,"selected" if k==int(ui.large) else "tab")
    ui.button(x,ui.h-65,w if ui.p else 150,46,back,"secondary","back")
    if slug=="settings-error":
        dialog(ui,"gear",("Настройки не подтверждены","Settings unconfirmed"),
               ("Настройки изменились извне. Перезагрузите игру. Повторите запись или вернитесь к сохранённым настройкам.",
                "Settings were changed externally. Reload the game. Retry saving or return to the saved settings."),
               [(("Повторить сохранение","Retry Save"),"primary"),(("Вернуться к сохранённому","Restore Saved Settings"),"secondary")])

def draw(ui,slug):
    if slug.startswith("settings"):settings(ui,slug)
    else:game_menu(ui,slug)

