"""Verify the delivered PNG matrix, native scale, shared components and local references."""
import json,re
from PIL import Image,ImageChops
from kit import ROOT, N
from render import DEVICES, VARIANTS, SHEETS, capture

screens=json.loads((ROOT/"source/screens.json").read_text(encoding="utf-8"))
def pixels(path):
    with Image.open(path) as f:
        f.load();return f.convert("RGB")
def equal(a,b):return a.size==b.size and ImageChops.difference(a,b).getbbox() is None

n=0
for variant in VARIANTS:
    for device,(w,h,k) in DEVICES.items():
        for slug in screens:
            im=pixels(capture(slug,device,variant))
            assert im.size==(w*k,h*k),(slug,device,im.size)
            if k==2:assert equal(im,im.resize((w,h),N).resize(im.size,N)),(slug,"non-native raster")
            n+=1
        first=pixels(capture("intro-1",device,variant))
        # Both buttons, lettering and anchor positions repeat across all seven chapters.
        if device=="portrait":box=(15,518,345,610)
        else:box=((w*55//100+17)*k,247*k,(w-16)*k,336*k)
        for i in range(2,8):
            assert equal(first.crop(box),pixels(capture(f"intro-{i}",device,variant)).crop(box)),("commands",i,device,variant)
    assert set(p.stem for p in (ROOT/"mockups"/variant/"desktop").glob("*.png"))==set(screens)

manifest=json.loads((ROOT/"sprites/ui.json").read_text(encoding="utf8"))
frames=json.loads((ROOT/"sprites/frames.json").read_text(encoding="utf8"))
assert set(frames)=={p.relative_to(ROOT).as_posix() for p in (ROOT/"sprites").glob("*/*.png")}
for filename,record in frames.items():
    with Image.open(ROOT/filename) as f:
        assert record["sourceRect"]==[0,0,f.width,f.height] and record["mode"]==f.mode,filename
for name,item in manifest.items():
    with Image.open(ROOT/item["file"]) as f:
        assert f.size==(item["width"],item["height"]) and f.mode=="RGBA",name
        if "sliceLTRB" in item:
            l,t,r,b=item["sliceLTRB"];assert l+r<=f.width and t+b<=f.height
        if name.startswith("icon-") or name in ("frame","panel","primary","gatehouse"):
            assert f.getchannel("A").getextrema()==(0,255),name
for device,(w,h,k) in DEVICES.items():
    assert pixels(ROOT/"reference"/(device+".png")).size==(w*k,h*k)
    for sheet,items in SHEETS.items():
        im=pixels(ROOT/"comparisons"/device/(sheet+".png"))
        cols=4 if device=="portrait" else 3
        for i,slug in enumerate(items):
            x=12+i%cols*(w+12);y=55+i//cols*(h+34)
            assert equal(im.crop((x,y,x+w,y+h)),pixels(capture(slug,device,"ru-normal")).resize((w,h),N)),(device,sheet,slug)

for md in ROOT.rglob("*.md"):
    for href in re.findall(r"\]\(([^)]+)\)",md.read_text(encoding="utf8")):
        if href.startswith(("https:","http:","#")):continue
        assert (md.parent/href.split("#")[0]).exists(),(md.name,href)
for path in ROOT.rglob("*.png"):
    with Image.open(path) as f:f.verify()
print(json.dumps({"mockups":n,"screenStates":len(screens),"comparisonSheets":len(SHEETS)*3,
                  "uiAssets":len(manifest),"worldAssets":len(list((ROOT/"sprites/world").glob("*.png"))),
                  "navigationAssets":len(list((ROOT/"sprites/navigation").glob("*.png"))),
                  "illustrations":len(list((ROOT/"illustrations").glob("*.png")))},indent=2))

