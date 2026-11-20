"""Produce the 1:1 material study and an index of the reusable pixel components."""
from layout import *

def proof(out):
    raw=REPO/'public/images/menu-buttons-v2';src=Image.open(raw/'frame-states.png').convert('RGBA')
    im=Image.new('RGBA',(790,420),INK);d=ImageDraw.Draw(im)
    def word(x,y,s,size=15,col=TEXT):
        d.text((x,y),s,font=font('body',size),fill=col)
    word(17,10,'Главное меню · исходный масштаб 1:1',19,GOLD)
    for i,s in enumerate(['Покой','Наведение / фокус','Нажатие']):
        x=16+i*253;word(x,50,s);im.alpha_composite(src.crop((240*i,0,240*i+240,48)),(x,77))
    labels=Image.open(raw/'labels-ru.png').convert('RGBA')
    im.alpha_composite(labels,(16,136));word(519,145,'Русские надписи отдельным слоем')
    word(16,211,'Новые компоненты · 1:1',19,GOLD)
    for i,key in enumerate(['button-normal','button-hover','button-pressed']):
        x=16+i*253;im.alpha_composite(SPRITES[key],(x,252))
    for i,key in enumerate(['#050a15','#142d4b','#152e4d','#1b3b60','#674535','#f28345','#f6a86e','#ffcf92']):
        x=18+i*93;d.rectangle((x,334,x+70,365),fill=key,outline='#45596b');word(x,374,key,13)
    (out/'reference').mkdir(exist_ok=True);im.convert('RGB').save(out/'reference/material-study.png')
    board=Image.new('RGBA',(825,510),INK);dd=ImageDraw.Draw(board)
    def label(x,y,s,sz=14):
        dd.text((x,y),s,font=font('body',sz),fill=TEXT)
    label(15,9,'Компоненты · исходный масштаб',21)
    for i,key in enumerate(['normal','hover','focus','pressed','disabled']):
        x=18+(i%3)*267;y=53+(i//3)*80
        board.alpha_composite(SPRITES['button-'+key],(x,y));label(x+8,y+46,key)
    for i,key in enumerate(['panel-normal','parchment-normal','tab-normal','tab-selected','tab-disabled']):
        x=18+i*160;board.alpha_composite(nine(key,138,39),(x,221));label(x,266,key,13)
    icons=[s for s in SPRITES if s.startswith('icon-')]
    for i,name in enumerate(icons):
        x=21+i%9*89;y=305+i//9*59;board.alpha_composite(SPRITES[name],(x,y));label(x,y+22,name[5:],12)
    for i,k in enumerate(['health','armor','light','danger','empty']):
        x=20+i*160;board.alpha_composite(SPRITES['meter-'+k],(x,490));label(x+34,481,k,12)
    board.convert('RGB').save(out/'reference/component-library.png')

