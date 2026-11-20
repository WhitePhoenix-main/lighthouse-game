"""Local, network-free index for native-size PNG inspection."""
from pathlib import Path
import html,json

def generate_indices(out,scenes,devices,groups):
    labels={"desktop":"ПК","phone-landscape":"Телефон горизонтально","phone-portrait":"Телефон вертикально"}
    for v in ("ru-normal","ru-large","en-normal","en-large"):
        root=out/("boards" if v=="ru-normal" else "locales/"+v);root.mkdir(parents=True,exist_ok=True)
        rows=[f"# Макеты {v}", "", "| Экран | 1280 × 720 | 844 × 390 | 390 × 844 |","| --- | --- | --- | --- |"]
        for key,name,*_ in scenes:rows.append(f"| {name} | "+" | ".join(f"[{labels[d]}]({d}/{key}.png)" for d in devices)+" |")
        (root/"INDEX.md").write_text("\n".join(rows)+"\n",encoding="utf8")
    ops=lambda seq:"".join(f'<option value="{html.escape(k)}">{html.escape(n)}</option>' for k,n in seq)
    screen_options=ops((s[0],s[1]) for s in scenes)
    sequence=ops((g,g) for g in groups)
    document='''<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Свет Авалона · просмотр макетов</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101b29;color:#e9dfc9;font:15px system-ui,sans-serif}header{padding:12px 18px;background:#15283b;border-bottom:1px solid #4b5d68;display:flex;align-items:end;flex-wrap:wrap;gap:9px 17px}label{display:grid;gap:4px;font-size:12px;color:#c1cbd0}select,button{background:#142638;color:#f6e5c5;border:1px solid #668090;border-radius:3px;padding:6px;font:inherit;min-height:33px}select:focus,button:focus,a:focus{outline:2px solid #ffcb89}main{padding:12px 16px;overflow:auto}img{display:block;image-rendering:pixelated;max-width:100%;max-height:calc(100vh - 150px);object-fit:contain;object-position:top left;width:auto;height:auto}.actual img{max-height:none;max-width:none}a{color:#f8c386}span{align-self:center;color:#a7bac8}p{margin:7px 0 0}
</style><header><label>Материал<select id="kind"><option value="board">Макет</option><option value="sheet">Сравнительный лист</option></select></label>
<label>Экран<select id="scene">SCENES</select></label><label hidden id="sheetLabel">Переход<select id="sheet">SHEETS</select></label>
<label>Окно<select id="device"><option value="desktop">ПК 1280 × 720</option><option value="phone-landscape">Телефон 844 × 390</option><option value="phone-portrait">Телефон 390 × 844</option></select></label>
<label id="viewLabel">Подписи<select id="variant"><option value="ru-normal">Русский · обычные</option><option value="ru-large">Русский · крупные</option><option value="en-normal">English · обычные</option><option value="en-large">English · крупные</option></select></label>
<button id="size" aria-pressed="false">Масштаб 1:1</button><a id="original" target="_blank">Открыть PNG</a></header>
<main><img id="frame" alt="Макет игры"><p id="info"></p></main>
<script>
const el=id=>document.getElementById(id);
function paint(){
 const isSheet=el('kind').value==='sheet', dev=el('device').value, mode=el('variant').value;
 el('scene').parentElement.style.display=isSheet?'none':'grid';el('sheetLabel').style.display=isSheet?'grid':'none';el('viewLabel').style.display=isSheet?'none':'grid';
 const path=isSheet?'sheets/'+dev+'/'+el('sheet').value+'.png':(mode==='ru-normal'?'boards':'locales/'+mode)+'/'+dev+'/'+el('scene').value+'.png';
 el('frame').src=path;el('original').href=path;el('frame').alt=(isSheet?'Сравнение ':'Экран ')+(isSheet?el('sheet'):el('scene')).selectedOptions[0].text;
 el('frame').onload=()=>el('info').textContent=el('frame').naturalWidth+' × '+el('frame').naturalHeight+' px';
}for(const c of document.querySelectorAll('select'))c.addEventListener('change',paint);
el('size').addEventListener('click',()=>{const on=document.body.classList.toggle('actual');el('size').setAttribute('aria-pressed',on);el('size').textContent=on?'Вписать в окно':'Масштаб 1:1'});paint();
</script></html>'''
    (out/"gallery.html").write_text(document.replace("SCENES",screen_options).replace("SHEETS",sequence),encoding="utf8")
