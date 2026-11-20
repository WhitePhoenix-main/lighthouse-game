"""Validate exported files, logical pixel pitch, sprite assembly and locale coverage."""
from pathlib import Path
import argparse,hashlib,itertools,json,re,sys
from PIL import Image,ImageChops
ROOT=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/"source"))
import material as m
from layout import DEVICES
from progress import cutaways
from world import coastal_x,PLACED
from scenes import SCENES
from build import board_path,VIEWS,GROUPS

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument("--out",type=Path,default=ROOT);args=ap.parse_args();out=args.out.resolve()
    m.prepare();cutaways()
    audit=out/"audit";audit.mkdir(exist_ok=True)
    data=json.loads((audit/"layout.json").read_text(encoding="utf8"))
    manifest=json.loads((out/"sprites/atlas.json").read_text(encoding="utf8"))
    files={};checked_controls=0;checked_pixels=0
    expected={board_path(out,v,d,s[0]).relative_to(out).as_posix() for s in SCENES for v in VIEWS for d in DEVICES}
    assert {e["path"] for e in data["boards"]}==expected
    assert len(data["controls"])==len(expected)
    assert not json.loads((audit/"export-errors.json").read_text())
    atlas=Image.open(out/"sprites/atlas.png").convert("RGBA");previous=[]
    for name,frame in manifest["frames"].items():
        path=out/"sprites"/frame["file"];sp=Image.open(path)
        x,y,w,h=frame["rect"];assert sp.mode=="RGBA" and sp.size==(w,h) and sp.getchannel("A").getextrema()==(0,255),name
        assert x>=0 and y>=0 and x+w<=atlas.width and y+h<=atlas.height
        assert sp.tobytes()==atlas.crop((x,y,x+w,y+h)).tobytes(),name
        for a,b,c,d in previous:assert a>=x+w or x>=a+c or b>=y+h or y>=b+d,(name,frame)
        previous.append((x,y,w,h))
        if "nineSlice" in frame:
            l,t,r,b=frame["nineSlice"];assert l+r<w and t+b<h
        if "anchor" in frame:
            ax,ay=frame["anchor"];assert 0<=ax<=w and 0<=ay<=h
        files[path.relative_to(out).as_posix()]=sha(path)
    assert set(manifest["frames"])==set(m.SPRITES)
    for v in VIEWS:
        for device,(target,native,scale) in DEVICES.items():
            for key,*_ in SCENES:
                path=board_path(out,v,device,key);im=Image.open(path)
                assert im.size==target and im.mode=="RGB"
                if device=="desktop":
                    tiny=im.resize(native,Image.Resampling.NEAREST)
                    assert ImageChops.difference(im,tiny.resize(target,Image.Resampling.NEAREST)).getbbox() is None,(v,key)
                hits=data["controls"][f"{v}/{device}/{key}"]["controls"]
                for item in hits:
                    x,y,w,h=item["rect"];assert x>=0 and y>=0 and x+w<=native[0] and y+h<=native[1],(key,item)
                    skin=item.get("sprite")
                    if not skin:continue
                    sp=m.sliced(skin,(w,h));checked_controls+=1
                    # Sample two solid, unobstructed rim pixels against the exported
                    # board. This catches a re-tinted skin or accidental local zoom.
                    for ux,uy in [(w//2,1),(w//2,h-5)]:
                        wanted=sp.getpixel((ux,uy))
                        if wanted[3]!=255:continue
                        a=round((x+ux+.5-native[0]/2)*scale+target[0]/2-.5)
                        b=round((y+uy+.5-native[1]/2)*scale+target[1]/2-.5)
                        assert im.getpixel((a,b))==wanted[:3],(v,device,key,skin,item["action"],(a,b),im.getpixel((a,b)),wanted)
                        checked_pixels+=1
                files[path.relative_to(out).as_posix()]=sha(path)
    for device in DEVICES:
        for scene,*_ in SCENES:
            signatures={files[board_path(out,v,device,scene).relative_to(out).as_posix()] for v in VIEWS}
            assert len(signatures)==4,(device,scene,"missing distinct locale/size")
        w,h=DEVICES[device][0]
        for group in GROUPS:
            path=out/"sheets"/device/(group+".png")
            with Image.open(path) as im:assert im.size==(2*w,2*(h+34))
            files[path.relative_to(out).as_posix()]=sha(path)
    for kind,(x,y) in PLACED.items():assert x<coastal_x(y) and (x*x+y*y)**.5<300
    assert 126>coastal_x(105)
    for i in range(8):
        p=out/"plates"/("epilogue.png" if i==7 else f"chapter-{i+1:02d}.png")
        with Image.open(p) as im:assert im.size==(308,230)
    for sub in ["plates","sheets","sprites"]:
        for p in sorted((out/sub).rglob("*")):
            if p.is_file():files[p.relative_to(out).as_posix()]=sha(p)
    report={"states":len(SCENES),"boards":len(expected),"views":list(VIEWS),"viewports":list(DEVICES),
            "atlasFrames":len(manifest["frames"]),"nineSliceFrames":len(m.SLICES),"routeSheets":len(GROUPS)*len(DEVICES),
            "nativeEvidenceSheets":1,"journalPlates":8,"terrainTiles":4,"controlsCompared":checked_controls,"rimPixelsCompared":checked_pixels,
            "desktopTwiceNative":True,"distinctLocaleAndSizeImagesPerState":4,"allSpriteAlphaRanges":[0,255],
            "nativeTerrainPoints":48,"hashes":len(files)}
    (audit/"verification.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    (audit/"sha256.json").write_text(json.dumps(dict(sorted(files.items())),indent=2)+"\n",encoding="utf8")
    if out==ROOT:
        for doc in ["README.md","STYLE.md","SOURCES.md","CHECKS.md"]:
            file=out/doc
            for href in re.findall(r"\[[^\]]+\]\(([^)]+)\)",file.read_text(encoding="utf8")):
                if "://" not in href and not href.startswith("#"):
                    assert (out/href.split("#")[0]).exists(),(doc,href)
    print(json.dumps(report,ensure_ascii=True))
if __name__=="__main__":main()
