"""Decode exports and compare atlas cells to the individual PNGs."""
import hashlib
import json
from pathlib import Path
from PIL import Image

def hashfile(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify(out,scenes,targets):
    manifest=json.loads((out/'manifest.json').read_text(encoding='utf8'))
    assert manifest['screens']==list(scenes)
    expected={f'mockups/{target}/{key}.png' for target in targets for key in scenes}
    assert set(manifest['images'])==expected
    for name in (*manifest['images'],*manifest['stressSamples']):
        target=Path(name).parent.name
        with Image.open(out/name) as im:
            im.load();assert im.size==targets[target][1],name
    meta=json.loads((out/'sprites/manifest.json').read_text(encoding='utf8'))
    sheet=Image.open(out/'sprites/atlas.png').convert('RGBA')
    for name,item in meta.items():
        with Image.open(out/item['file']) as im:
            assert im.mode=='RGBA' and list(im.size)==item['size'],name
            if 'atlas' in item:
                x,y,w,h=item['atlas']
                assert sheet.crop((x,y,x+w,y+h)).tobytes()==im.tobytes(),name
            if 'nineSlice' in item:
                l,t,r,b=item['nineSlice'];assert im.width>l+r and im.height>t+b,name
    for f,digest in manifest['sha256'].items():
        assert hashfile(out/f)==digest,f
    print(f'PNG mockups {len(expected)}, accessibility samples {len(manifest["stressSamples"])}, sprites {len(meta)}, hashed files {len(manifest["sha256"])}')

