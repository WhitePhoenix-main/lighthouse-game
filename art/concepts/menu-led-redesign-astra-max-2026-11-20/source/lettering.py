"""Two native text layers: the menu's display face and an original readable bitmap hand."""
from functools import lru_cache
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "masters/menu/VollkornSC-Regular.ttf"
# Seven rows for capitals, seven including the ascender for lowercase. Two extra
# rows contain letter descenders. Each hexadecimal digit group is a scanline.
upper = {
    "A":"0e 11 11 1f 11 11 11","B":"1e 11 11 1e 11 11 1e","C":"0e 11 10 10 10 11 0e",
    "D":"1c 12 11 11 11 12 1c","E":"1f 10 10 1e 10 10 1f","F":"1f 10 10 1e 10 10 10",
    "G":"0e 11 10 17 11 11 0e","H":"11 11 11 1f 11 11 11","I":"07 02 02 02 02 02 07",
    "J":"07 01 01 01 11 11 0e","K":"11 12 14 18 14 12 11","L":"10 10 10 10 10 10 1f",
    "M":"11 1b 15 15 11 11 11","N":"11 19 19 15 13 13 11","O":"0e 11 11 11 11 11 0e",
    "P":"1e 11 11 1e 10 10 10","Q":"0e 11 11 11 15 12 0d","R":"1e 11 11 1e 14 12 11",
    "S":"0f 10 10 0e 01 01 1e","T":"1f 04 04 04 04 04 04","U":"11 11 11 11 11 11 0e",
    "V":"11 11 11 11 11 0a 04","W":"11 11 11 15 15 15 0a","X":"11 11 0a 04 0a 11 11",
    "Y":"11 11 0a 04 04 04 04","Z":"1f 01 02 04 08 10 1f",
    "Б":"1f 10 10 1e 11 11 1e","Г":"1f 10 10 10 10 10 10","Д":"0e 0a 0a 0a 0a 1f 11",
    "Ж":"49 2a 1c 08 1c 2a 49","З":"0e 11 01 06 01 11 0e","И":"11 11 13 15 19 11 11",
    "Й":"0a 04 11 13 15 19 11","Л":"0f 09 09 09 09 09 11","П":"1f 11 11 11 11 11 11",
    "У":"11 11 11 0a 04 08 10","Ф":"04 0e 15 15 0e 04 04","Ц":"12 12 12 12 12 1f 01",
    "Ч":"11 11 11 0f 01 01 01","Ш":"15 15 15 15 15 15 1f","Щ":"2a 2a 2a 2a 2a 3f 01",
    "Ъ":"18 08 08 0e 09 09 0e","Ы":"21 21 21 39 25 25 39","Ь":"10 10 10 1e 11 11 1e",
    "Э":"0e 11 01 0f 01 11 0e","Ю":"26 29 29 39 29 29 26","Я":"0f 11 11 0f 05 09 11",
    "Ё":"0a 00 1f 10 1e 10 1f",
}
lower = {
    "a":"00 00 0e 01 0f 11 0f","b":"10 10 1e 11 11 11 1e","c":"00 00 0f 10 10 10 0f",
    "d":"01 01 0f 11 11 11 0f","e":"00 00 0e 11 1f 10 0f","f":"03 04 04 0f 04 04 04",
    "g":"00 00 0f 11 11 11 0f 01 0e","h":"10 10 1e 11 11 11 11","i":"01 00 01 01 01 01 01",
    "j":"02 00 02 02 02 02 02 02 0c","k":"10 10 12 14 18 14 12","l":"03 01 01 01 01 01 01",
    "m":"00 00 1a 15 15 15 15","n":"00 00 1e 11 11 11 11","o":"00 00 0e 11 11 11 0e",
    "p":"00 00 1e 11 11 11 1e 10 10","q":"00 00 0f 11 11 11 0f 01 01","r":"00 00 0b 0c 08 08 08",
    "s":"00 00 0f 10 0e 01 1e","t":"04 04 0f 04 04 04 03","u":"00 00 11 11 11 11 0f",
    "v":"00 00 11 11 11 0a 04","w":"00 00 11 15 15 15 0a","x":"00 00 11 0a 04 0a 11",
    "y":"00 00 11 11 11 11 0f 01 0e","z":"00 00 1f 02 04 08 1f",
    "б":"03 0c 10 1e 11 11 0e","в":"00 00 1e 11 1e 11 1e","г":"00 00 0f 08 08 08 08",
    "д":"00 00 0e 0a 0a 0a 1f 11","ж":"00 00 2a 1c 08 1c 2a","з":"00 00 1e 01 0e 01 1e",
    "и":"00 00 11 13 15 19 11","й":"0a 04 11 13 15 19 11","к":"00 00 11 12 1c 12 11",
    "л":"00 00 0f 09 09 09 11","м":"00 00 11 1b 15 11 11","н":"00 00 11 11 1f 11 11",
    "п":"00 00 1f 11 11 11 11","т":"00 00 1f 04 04 04 04","ф":"04 04 0e 15 15 15 0e 04 04",
    "ц":"00 00 12 12 12 12 1f 01","ч":"00 00 11 11 0f 01 01","ш":"00 00 15 15 15 15 1f",
    "щ":"00 00 2a 2a 2a 2a 3f 01","ъ":"00 00 18 08 0e 09 0e","ы":"00 00 21 21 39 25 39",
    "ь":"00 00 10 10 1e 11 1e","э":"00 00 0e 01 0f 01 0e","ю":"00 00 26 29 39 29 26",
    "я":"00 00 0f 11 0f 05 09","ё":"0a 00 0e 11 1f 10 0f",
}
aliases = {"А":"A","В":"B","Е":"E","К":"K","М":"M","Н":"H","О":"O","Р":"P","С":"C","Т":"T","Х":"X",
           "а":"a","е":"e","о":"o","р":"p","с":"c","у":"y","х":"x"}
other = {
    "0":"0e 11 13 15 19 11 0e","1":"02 06 02 02 02 02 07","2":"0e 11 01 02 04 08 1f",
    "3":"1e 01 01 0e 01 01 1e","4":"02 06 0a 12 1f 02 02","5":"1f 10 10 1e 01 01 1e",
    "6":"0e 10 10 1e 11 11 0e","7":"1f 01 02 04 04 08 08","8":"0e 11 11 0e 11 11 0e","9":"0e 11 11 0f 01 01 0e",
    ".":"00 00 00 00 00 00 01",",":"00 00 00 00 00 00 02 02 04",":":"00 00 01 00 00 01 00",
    ";":"00 00 02 00 00 02 02 04","!":"01 01 01 01 01 00 01","?":"0e 11 01 02 04 00 04",
    "/":"01 01 02 02 04 08 08","-":"00 00 00 07 00 00 00","—":"00 00 00 1f 00 00 00",
    "−":"00 00 00 0f 00 00 00","+":"00 04 04 1f 04 04 00","%":"11 02 02 04 08 08 11",
    "·":"00 00 00 01 00 00 00","→":"00 04 02 1f 02 04 00","×":"00 00 05 02 05 00 00",
    "«":"00 00 05 0a 14 0a 05","»":"00 00 14 0a 05 0a 14","'":"01 01 02 00 00 00 00",
    "#":"00 0a 1f 0a 1f 0a 00","(":"01 02 04 04 04 02 01",")":"04 02 01 01 01 02 04",
    "°":"02 05 02 00 00 00 00","…":"00 00 00 00 00 00 15","’":"01 01 02 00 00 00 00",
    " ": "", "–":"00 00 00 0f 00 00 00",
}
glyphs = {k:[int(v,16) for v in s.split()] for k,s in {**upper,**lower,**other}.items()}
for character, shape in aliases.items():
    glyphs[character] = glyphs[shape]

def advance(c):
    return 3 if c == ' ' else max(glyphs[c]).bit_length() + 1

@lru_cache(maxsize=8000)
def body_mask(s, height):
    if not s: return Image.new("L",(1,1))
    w = sum(advance(c) for c in s) - 1
    mask = Image.new("L",(max(1,w),9))
    draw=ImageDraw.Draw(mask)
    x=0
    for c in s:
        patterns=glyphs[c]
        width=advance(c)-1
        for y, row in enumerate(patterns):
            for col in range(width):
                if row & 1 << (width-1-col): draw.point((x+col,y),fill=255)
        x+=advance(c)
    return mask.resize((max(1,round(w*height/7)), max(1,round(9*height/7))), Image.Resampling.NEAREST)

@lru_cache(maxsize=50)
def face(size):
    return ImageFont.truetype(str(FONT),size,layout_engine=ImageFont.Layout.BASIC)

@lru_cache(maxsize=8000)
def display_mask(s,height):
    if not s: return Image.new("L",(1,1))
    if "→" in s:
        # Vollkorn SC has no U+2192. Use the project's original seven-row
        # arrow and align it with the optical middle of the neighbouring ink.
        chunks=s.split("→")
        arrow=body_mask("→",max(7,round(height*.88)))
        arrow=arrow.crop(arrow.getbbox())
        masks=[]
        for i,chunk in enumerate(chunks):
            if i:masks.append(arrow)
            if chunk:masks.append(display_mask(chunk,height))
        h=max(piece.height for piece in masks)
        result=Image.new("L",(sum(piece.width for piece in masks),h))
        xx=0
        for piece in masks:
            result.paste(piece,(xx,(h-piece.height)//2));xx+=piece.width
        return result
    # Nominal height describes ink on an unaccented capital.
    font=face(max(9,round(height*1.49)))
    bbox=font.getbbox(s)
    mask=Image.new("L",(max(1,bbox[2]-bbox[0]),max(1,bbox[3]-bbox[1])))
    ImageDraw.Draw(mask).text((-bbox[0],-bbox[1]),s,font=font,fill=255)
    return mask.point(lambda value: 255 if value>=83 else 0)

def mask_of(s, size, style):
    return (body_mask if style=="body" else display_mask)(s,size)

@lru_cache(maxsize=20000)
def width(s, size, style):
    return mask_of(s,size,style).width if s else 0

def wrap(s, w, size, style):
    result=[]
    for paragraph in s.split("\n"):
        words=paragraph.split(" ")
        line=""
        for word in words:
            new=(line+" "+word).strip()
            if line and width(new,size,style)>w:
                result.append(line); line=word
            else:
                line=new
        result.append(line)
    return result

def write_line(im,s,x,y,size,style,ink,relief=False):
    mask=mask_of(s,size,style)
    if relief and s:
        # The same dark cast, amber foot and brighter upper edge as the menu.
        im.paste("#1d1312",(x+1,y+2),mask)
        im.paste("#8f4822",(x,y+1),mask)
        face_image=Image.new("RGB",mask.size,ink)
        grad=ImageDraw.Draw(face_image)
        grad.rectangle((0,0,mask.width,max(0,mask.height//4-1)),fill="#ffe3ad")
        grad.rectangle((0,int(mask.height*.70),mask.width,mask.height),fill="#e89a48")
        im.paste(face_image,(x,y),mask)
    else:
        im.paste(ink,(x,y),mask)
    return mask.getbbox()
