"""Lifecycle decisions, write failures and the test-only reward confirmation."""
from PIL import Image
from material import *
from layout import shade
from leaves import select_game,settings
from battle import battle
from world import draw_world
from preparation import prep_top

STATES={
    "pause":("pause","Тихая минута.|A Quiet Moment.","Ночь ждёт. Направление света сохранено.|The night waits. Your beam direction is preserved.",
             [("Продолжить ночь|Resume night","primary","play"),("Настройки|Settings","quiet","settings"),("Прервать ночь…|Abandon night…","quiet","close")]),
    "abandon":("warning","Прервать эту ночь?|Abandon this night?","Награды и новые встречи этой ночи будут потеряны. Устройства вернутся к состоянию на старте. Покупки и ремонт подготовки сохранятся.|Rewards and new encounters from this night will be lost. Devices return to their starting condition. Preparation purchases and repairs are kept.",
               [("Остаться в паузе|Stay paused","primary","pause"),("Прервать → подготовка|Abandon → preparation","danger",None),("Прервать → главное меню|Abandon → main menu","danger",None)]),
    "reset":("warning","Начать новую игру?|Start a new game?","Текущее прохождение, ресурсы и улучшения будут удалены. Настройки сохранятся.|Current progress, resources and upgrades will be deleted. Settings are kept.",
             [("Отмена|Cancel","primary",None),("Начать заново|Start again","danger","retry")]),
    "save-error":("warning","Результат ещё не сохранён|Result not yet saved","Не удалось подтвердить запись. Награда ожидает сохранения. Переход к следующей ночи временно закрыт.|The write could not be confirmed. The reward is pending. Advance after the result is saved.",
                  [("Повторить сохранение|Retry save","primary","retry"),("Перечитать сохранение|Reload save","quiet","book")]),
    "reload":("book","Перечитать записанный профиль?|Reload the saved profile?","Незавершённая ночь будет прервана.|The unfinished night will be interrupted.",
              [("Отмена|Cancel","primary",None),("Перечитать сохранение|Reload save","danger","retry")]),
    "settings-error":("warning","Настройки ещё не сохранены|Settings not yet saved","Изменение громкости ожидает записи.|The volume change is waiting to be saved.",
                      [("Повторить|Retry","primary","retry"),("Отменить изменение|Cancel change","quiet",None)]),
    "locked":("lock","Маяк уже открыт|Lighthouse already open","Маяк уже открыт в другой вкладке. Закройте её и обновите эту страницу.|The lighthouse is open in another tab. Close it and refresh this page.",
              []),
    "interrupted":("moon","Ночь была прервана|The night was interrupted","Награды этой ночи отброшены. Устройства сохранили состояние на старте. Покупки подготовки уже записаны.|This night’s rewards were discarded. Devices retain their starting condition. Preparation purchases were saved.",
                   [("Продолжить|Continue","primary","play")]),
    "reward-test":("collection","Тест видеонаграды|Reward video test","Осколки +10. Осталось 2 набора за 24 часа. Общий лимит всех наград · 3 за 24 часа.|Shards +10. Two shard packs remain in 24 hours. Overall limit · 3 rewards per 24 hours.",
                   [("Имитировать подтверждение|Simulate confirmation","primary","check"),("Отменить предложение|Cancel offer","quiet",None),("Имитировать отсутствие видео|Simulate no video","quiet",None)]),
}
def overlay(b,key):
    icon,title,body,actions=STATES[key]
    if key=="interrupted":
        b.base(.02)
        from material import MASTERS
        if b.p:xx=(b.w-240)//2;logo=415;first=507;second=569
        else:xx=18+(b.w-640)//2;logo=30;first=202;second=258
        original=Image.open(MASTERS/"menu/title.png").convert("RGBA").crop((0,0,240,80))
        b.im.alpha_composite(original,(xx,logo))
        frame=Image.open(MASTERS/"menu/frame-states.png").convert("RGBA").crop((0,0,240,48))
        labels=Image.open(MASTERS/("menu/labels-"+b.lang+".png")).convert("RGBA")
        for i,t in enumerate((first,second)):
            b.im.alpha_composite(frame,(xx,t));b.im.alpha_composite(labels.crop((i*240,0,i*240+240,48)),(xx,t))
        ww=b.w-18 if b.p else 280;x=9 if b.p else b.w-ww-12;y=9 if b.p else 13;hh=153 if b.p else 141
        b.box((x,y,ww,hh),"panel-stone");b.icon("moon",x+9,y+10)
        b.title((x+35,y+6,ww-49,42),title,15,floor=11)
        b.text((x+13,y+54,ww-26,hh-66),body,9,ink=MILK,floor=8)
        return
    if key in ("pause","abandon"):
        battle(b,"normal");b.im.paste(shade(b.im,.75))
    elif key in ("reset","interrupted"):
        select_game(b);b.im.paste(shade(b.im,.81))
    elif key=="settings-error":
        settings(b);b.im.paste(shade(b.im,.80))
    elif key in ("reward-test",):
        draw_world(b,"prep");prep_top(b);b.im.paste(shade(b.im,.79))
    else:b.base(.67)
    # The first action is always the safe default for destructive choices.
    b.hit.clear()
    width=b.w-18 if b.p else min(452,b.w-56)
    height=(min(518,265+len(actions)*62) if b.p else (306 if len(actions)>=3 else 256 if len(actions)>0 else 185))
    x=(b.w-width)//2;y=(b.h-height)//2
    b.box((x,y,width,height),"panel-stone" if key in ("pause","reload","interrupted","reward-test") else "panel-signal")
    b.icon(icon,x+15,y+13)
    section=("Дежурство приостановлено|Watch paused" if key in ("pause","abandon") else "Стенд · Только Vite dev|Test fixture · Vite dev only" if key=="reward-test" else "Настройки|Settings" if key=="settings-error" else "Кампания|Campaign")
    b.text((x+42,y+16,width-58,18),section,8,ink=MUTED,floor=7)
    th=80 if b.p else 49
    b.title((x+16,y+40,width-32,th),title,20,ink=GOLD if key not in ("locked","save-error","settings-error") else IVORY,floor=14)
    b.line(x+16,y+th+43,width-32)
    btnh=44 if b.p else 40;gap=5
    start=y+height-14-len(actions)*(btnh+gap)+gap
    bodyy=y+th+55;bodyh=start-bodyy-7 if actions else y+height-15-bodyy
    b.text((x+16,bodyy,width-32,bodyh),body,9,ink=MILK,floor=8)
    for i,(label,kind,ico) in enumerate(actions):
        b.btn((x+14,start+i*(btnh+gap),width-28,btnh),label,kind,ico,size=12)
