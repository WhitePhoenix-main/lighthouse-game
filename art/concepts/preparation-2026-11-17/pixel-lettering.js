// Local concept copy of src/presentation/settingsLettering.ts. Original glyphs and rendering algorithm preserved; extra concept symbols below.
// Project button letterforms from art/menu-buttons-v2/lettering.mjs, extended
// for settings labels. The original button lettering and atlas remain separate.
const settingsGlyphs = {
    'Ж': ['11011011', '01111110', '00111100', '00011000', '00111100', '01111110', '11011011', '11011011', '11011011'],
    'А': ['00111000', '01111100', '01101100', '11000110', '11000110', '11111110', '11000110', '11000110', '11101111'],
    'Б': ['11111111', '01100011', '01100001', '01100000', '01111100', '01100110', '01100110', '01100110', '11111100'],
    'В': ['11111100', '01100110', '01100110', '01100110', '01111100', '01100110', '01100110', '01100110', '11111100'],
    'Г': ['11111111', '01100011', '01100001', '01100000', '01100000', '01100000', '01100000', '01100000', '11110000'],
    'Д': ['00111110', '00011010', '00011010', '00011010', '00011010', '00110010', '00110010', '01111111', '11000011'],
    'Е': ['11111111', '01100011', '01100001', '01101000', '01111000', '01101000', '01100001', '01100011', '11111111'],
    'З': ['01111100', '11000110', '10000110', '00001100', '00111000', '00001100', '10000110', '11000110', '01111100'],
    'И': ['11100111', '01100110', '01100110', '01101110', '01101110', '01110110', '01110110', '01100110', '11100111'],
    'Й': ['11100111', '01100110', '01100110', '01101110', '01101110', '01110110', '01110110', '01100110', '11100111'],
    'К': ['11101111', '01100110', '01101100', '01111000', '01111000', '01101100', '01100110', '01100110', '11101111'],
    'Л': ['00111111', '00011010', '00011010', '00011010', '00110010', '00110010', '00110010', '01100010', '11000111'],
    'М': ['11000011', '11100111', '11111111', '11011011', '11000011', '11000011', '11000011', '11000011', '11100111'],
    'Н': ['11101111', '01100110', '01100110', '01100110', '01111110', '01100110', '01100110', '01100110', '11101111'],
    'О': ['00111100', '01111110', '11000011', '11000011', '11000011', '11000011', '11000011', '01111110', '00111100'],
    'П': ['11111111', '01100110', '01100110', '01100110', '01100110', '01100110', '01100110', '01100110', '11101111'],
    'Р': ['11111100', '01100110', '01100110', '01100110', '01111100', '01100000', '01100000', '01100000', '11110000'],
    'С': ['00111111', '01110011', '11000001', '11000000', '11000000', '11000000', '11000001', '01110011', '00111110'],
    'Т': ['11111111', '11011011', '10011001', '00011000', '00011000', '00011000', '00011000', '00011000', '00111100'],
    'У': ['11100111', '01100110', '01100110', '00111100', '00011000', '00011000', '00011000', '00110000', '11100000'],
    'Х': ['11100111', '01100110', '00111100', '00011000', '00011000', '00111100', '01100110', '01100110', '11100111'],
    'Ч': ['11101111', '01100110', '01100110', '01100110', '00111110', '00000110', '00000110', '00000110', '00001111'],
    'Ы': ['11100111', '01100011', '01100011', '01111011', '01101111', '01101111', '01101111', '01101111', '11111011'],
    'Ь': ['11110000', '01100000', '01100000', '01111100', '01100110', '01100110', '01100110', '01100110', '11111100'],
    'Я': ['00111111', '01100110', '01100110', '01100110', '00111110', '00011110', '00110110', '01100110', '11101111'],
    'E': ['11111111', '01100011', '01100001', '01101000', '01111000', '01101000', '01100001', '01100011', '11111111'],
    'N': ['11100111', '01100110', '01110110', '01110110', '01111110', '01101110', '01101110', '01100110', '11100110'],
    'G': ['00111111', '01110011', '11000001', '11000000', '11001111', '11000110', '11000110', '01110110', '00111100'],
    'L': ['11110000', '01100000', '01100000', '01100000', '01100000', '01100000', '01100001', '01100011', '11111111'],
    'I': ['11111111', '00111100', '00011000', '00011000', '00011000', '00011000', '00011000', '00111100', '11111111'],
    'S': ['01111111', '11000011', '11000000', '01100000', '00111100', '00000110', '00000011', '11000011', '11111110'],
    'H': ['11101111', '01100110', '01100110', '01100110', '01111110', '01100110', '01100110', '01100110', '11101111'],
    '0': ['00111100', '01100110', '11000011', '11000111', '11011011', '11100011', '11000011', '01100110', '00111100'],
    '5': ['11111111', '11000000', '11000000', '11111100', '00000110', '00000011', '00000011', '11000110', '01111100'],
    '7': ['11111111', '11000011', '00000110', '00001100', '00011000', '00011000', '00110000', '00110000', '00110000'],
    '%': ['01100001', '10010010', '10010100', '01101000', '00010000', '00101100', '01010010', '10010010', '00001100']
};
// Latin letterforms share the corresponding approved Cyrillic silhouettes.
for (const [latin, cyrillic] of Object.entries({ A: 'А', B: 'В', C: 'С', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' })) {
    settingsGlyphs[latin] = settingsGlyphs[cyrillic];
}
Object.assign(settingsGlyphs, {
    D: ['11111100', '01100110', '01100011', '01100011', '01100011', '01100011', '01100011', '01100110', '11111100'],
    F: ['11111111', '01100011', '01100001', '01101000', '01111000', '01101000', '01100000', '01100000', '11110000'],
    J: ['00011111', '00000110', '00000110', '00000110', '00000110', '00000110', '11000110', '01101100', '00111000'],
    Q: ['00111100', '01111110', '11000011', '11000011', '11000011', '11011011', '11001110', '01111100', '00000111'],
    R: ['11111100', '01100110', '01100110', '01100110', '01111100', '01101100', '01100110', '01100110', '11100111'],
    U: ['11100111', '01100110', '01100110', '01100110', '01100110', '01100110', '01100110', '01111110', '00111100'],
    V: ['11100111', '01100110', '01100110', '01100110', '01100110', '01100110', '00111100', '00111100', '00011000'],
    W: ['11100111', '11000011', '11000011', '11000011', '11011011', '11011011', '11111111', '01100110', '01100110'],
    Z: ['11111111', '11000011', '00000110', '00001100', '00011000', '00110000', '01100000', '11000011', '11111111'],
    '1': ['00011000', '00111000', '01111000', '00011000', '00011000', '00011000', '00011000', '00011000', '01111110'],
    '2': ['01111100', '11000110', '00000110', '00001100', '00011000', '00110000', '01100000', '11000000', '11111110'],
    '3': ['01111100', '11000110', '00000110', '00001100', '00111000', '00001100', '00000110', '11000110', '01111100'],
    '4': ['00001100', '00011100', '00111100', '01101100', '11001100', '11111110', '00001100', '00001100', '00011110'],
    '6': ['00111100', '01100000', '11000000', '11111100', '11000110', '11000011', '11000011', '01100110', '00111100'],
    '8': ['00111100', '01100110', '11000011', '01100110', '00111100', '01100110', '11000011', '01100110', '00111100'],
    '9': ['00111100', '01100110', '11000011', '11000011', '01100111', '00111110', '00000110', '00001100', '01111000']
});
function settingsTextWidth(text, scale) {
    return Math.max(0, text.length * 9 - 1) * scale;
}
function drawSettingsPixelText(context, text, x, y, scale, color, align = 'left') {
    const advance = 9 * scale, width = settingsTextWidth(text, scale);
    const left = Math.round(x - (align === 'center' ? width / 2 : align === 'right' ? width : 0));
    const passes = [[1, 2, '#04101c'], [0, 0, color]];
    const transform = context.getTransform();
    const axisAligned = transform.b === 0 && transform.c === 0;
    context.save();
    // imageSmoothingEnabled does not affect fillRect. Snap shared cell edges in
    // backing pixels (including UI scale and DPR), so neighbouring cells have no
    // independently antialiased edges through which the shadow can show.
    if (axisAligned)
        context.resetTransform();
    const cell = (originX, originY, col, row, span = 1) => {
        const cellX = originX + col * scale, cellY = originY + row * scale;
        if (axisAligned) {
            const x0 = Math.round(transform.a * cellX + transform.e);
            const y0 = Math.round(transform.d * cellY + transform.f);
            const x1 = Math.round(transform.a * (originX + (col + span) * scale) + transform.e);
            const y1 = Math.round(transform.d * (originY + (row + 1) * scale) + transform.f);
            context.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        else {
            // Settings are axis-aligned; keep the API valid for rotated callers by
            // filling one combined silhouette instead of separately blended cells.
            context.rect(cellX, cellY, span * scale, scale);
        }
    };
    try {
        for (const [dx, dy, ink] of passes) {
            context.fillStyle = ink;
            if (!axisAligned)
                context.beginPath();
            for (let n = 0; n < text.length; n++) {
                const character = text.charAt(n);
                if (character === ' ')
                    continue;
                const rows = settingsGlyphs[character];
                if (!rows)
                    throw new Error('Missing settings pixel glyph: ' + character);
                const originX = left + n * advance + dx, originY = y + dy;
                for (let row = 0; row < 9; row++)
                    for (let col = 0; col < 8; col++) {
                        if (rows[row]?.charAt(col) === '1')
                            cell(originX, originY, col, row);
                    }
                if (character === 'Й') {
                    cell(originX, originY, 2, -3);
                    cell(originX, originY, 5, -3);
                    cell(originX, originY, 3, -2, 2);
                }
            }
            if (!axisAligned)
                context.fill();
        }
    }
    finally {
        context.restore();
    }
}

Object.assign(settingsGlyphs, {
 'Ц':['11100111','01100110','01100110','01100110','01100110','01100110','01100110','11111111','00000011'],
 'Ш':['11011011','11011011','11011011','11011011','11011011','11011011','11011011','11011011','11111111'],
 'Щ':['11011011','11011011','11011011','11011011','11011011','11011011','11011011','11111111','00000011'],
 'Ю':['11001110','11011011','11011011','11011011','11111011','11011011','11011011','11011011','11001110'],
 'Э':['01111100','11000110','00000011','00000011','00111111','00000011','00000011','11000110','01111100'],
 'Ф':['00011000','01111110','11011011','11011011','11011011','01111110','00011000','00011000','00111100'],
 'Ъ':['11110000','00110000','00110000','00111100','00110110','00110110','00110110','00110110','01111100'],
 '.':['00000000','00000000','00000000','00000000','00000000','00000000','00000000','00011000','00011000'],
 '·':['00000000','00000000','00000000','00000000','00011000','00011000','00000000','00000000','00000000'],
 '+':['00000000','00011000','00011000','00011000','11111111','00011000','00011000','00011000','00000000'],
 '-':['00000000','00000000','00000000','00000000','01111110','00000000','00000000','00000000','00000000'],
 '×':['00000000','11000011','01100110','00111100','00011000','00111100','01100110','11000011','00000000'],
 '←':['00000000','00010000','00110000','01111111','11111111','01111111','00110000','00010000','00000000'],
 '→':['00000000','00001000','00001100','11111110','11111111','11111110','00001100','00001000','00000000']
});
function pixelLabelText(text) { return text.toUpperCase().replace(/Ё/g,'Е').replace(/Й/g,'Й').replace(/[−—–]/g,'-').replace(/＋/g,'+').replace(/▦/g,''); }
function paintPixelLabels(root=document.body) {
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){return !node.parentElement.closest('script,style,canvas,.pixel-label,.sr-only') && node.textContent.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
 const nodes=[]; while(walk.nextNode()) nodes.push(walk.currentNode);
 for(const node of nodes){
  const label=document.createElement('span');label.className='pixel-label';label.dataset.label=node.textContent.trim();
  const fallback=document.createElement('span');fallback.className='sr-only';fallback.textContent=label.dataset.label;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true'); label.append(fallback,canvas);node.replaceWith(label);
 }
 for(const label of root.querySelectorAll('.pixel-label')){
  const text=pixelLabelText(label.dataset.label),parent=label.parentElement;
  const style=getComputedStyle(parent),scale=parent.closest('.brand')?2:1.25;
  const available=Math.max(60,parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-6);
  const limit=Math.max(5,Math.floor(available/(9*scale)));
  const lines=[];let line='';
  for(const word of text.split(/\s+/)){
   if(line && (line+' '+word).length>limit){lines.push(line);line='';}
   if(word.length>limit){if(line){lines.push(line);line='';}for(let n=0;n<word.length;n+=limit)lines.push(word.slice(n,n+limit));}
   else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  const canvas=label.querySelector('canvas'),width=Math.ceil(Math.max(...lines.map(s=>settingsTextWidth(s,scale)))+3),height=lines.length*18+4;
  const dpr=window.devicePixelRatio||1; canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  lines.forEach((s,i)=>drawSettingsPixelText(ctx,s,0,3+i*18,scale,style.color));
 }
}
