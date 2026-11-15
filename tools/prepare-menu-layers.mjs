import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const { default: sharp } = await import(process.env.LIGHTHOUSE_SHARP_PATH
  ? pathToFileURL(process.env.LIGHTHOUSE_SHARP_PATH).href : 'sharp');
const out = 'public/images/menu-layers/';
await mkdir(out, { recursive: true });
const layouts = {
  landscape: { width: 1672, height: 941, patches: [[125,150,440,160],[90,442,473,107],[90,575,473,103],[1485,450,140,135]] },
  portrait: { width: 1024, height: 1536, patches: [[190,765,650,195],[185,1073,653,136],[185,1260,653,135],[845,395,140,130]] },
};
for (const [name, layout] of Object.entries(layouts)) {
  const patches = [];
  for (const [x,y,w,h] of layout.patches) {
    const pad = 16, left = Math.max(0,x-pad), top = Math.max(0,y-pad);
    const width = Math.min(layout.width-left,w+pad*2), height = Math.min(layout.height-top,h+pad*2);
    const mask = Buffer.from(`<svg width="${width}" height="${height}"><defs><filter id="f"><feGaussianBlur stdDeviation="4"/></filter></defs><rect x="${x-left}" y="${y-top}" width="${w}" height="${h}" fill="white" filter="url(#f)"/></svg>`);
    const input = await sharp(`art/menu-layers/${name}-clean.png`).extract({left,top,width,height}).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    patches.push({input,left,top});
  }
  const base = await sharp(`art/concepts/arthurian-lighthouse/menu-${name}-no-dimming.png`).composite(patches).png().toBuffer();
  // Only settings uses these backgrounds; menu scenery comes from PNG sprite sheets.
  await writeFile(`${out}${name}-background-v2.webp`, await sharp(base).webp({quality:89,effort:6,smartSubsample:true}).toBuffer());
}
