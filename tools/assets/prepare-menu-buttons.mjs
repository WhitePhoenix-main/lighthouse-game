import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createButtonLabels } from '../../art/menu-buttons-v2/lettering.mjs';

const sharp = createRequire(import.meta.url)(process.env.LIGHTHOUSE_SHARP_PATH || 'sharp');
const WIDTH = 240, HEIGHT = 48;
const DEPTHS = [0, 0, 1, 2, 2, 1, 0, 0];
const ART = 'art/menu-buttons-v2', SOURCE = 'sprites/menu-buttons-v2', PUBLIC = 'public/images/menu-buttons-v2';
for (const directory of [ART, SOURCE, PUBLIC]) await mkdir(directory, { recursive: true });
const referencePath = 'art/menu-buttons-reference-v1/reference-pixel-v2.png';
const reference = await sharp(referencePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const crop = { left: 44, top: 196, width: 454, height: 108 };
const plaque = Buffer.alloc(crop.width * crop.height * 4);
for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
  const from = ((y + crop.top) * reference.info.width + x + crop.left) * 4;
  reference.data.copy(plaque, (y * crop.width + x) * 4, from, from + 4);
}
// Remove the old caption before finding the interior enclosed by the copper rim.
for (let y = 20; y < 85; y++) for (let x = 100; x < 360; x++) {
  const from = ((y + crop.top) * reference.info.width + crop.left + 28 + x % 65) * 4;
  reference.data.copy(plaque, (y * crop.width + x) * 4, from, from + 4);
}
for (let y = 0; y < crop.height; y++) {
  const cut = y < 2 || y > 105 ? crop.width : y < 8 || y > 99 ? 24 : y < 14 || y > 93 ? 14 : y < 22 || y > 85 ? 6 : 0;
  for (let x = 0; x < crop.width; x++) if (x < cut || x >= crop.width - cut) plaque[(y * crop.width + x) * 4 + 3] = 0;
}
const scaled = await sharp(plaque, { raw: { width: crop.width, height: crop.height, channels: 4 } })
  .resize(236, 46, { kernel: 'nearest', fit: 'fill' }).raw().toBuffer();
const master = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let y = 0; y < 46; y++) scaled.copy(master, ((y + 1) * WIDTH + 2) * 4, y * 236 * 4, (y + 1) * 236 * 4);

// Follow the entire blue face to its shaped inner rim, including the stepped corners.
const face = new Uint8Array(WIDTH * HEIGHT);
const queue = [Math.floor(HEIGHT / 2) * WIDTH + Math.floor(WIDTH / 2)];
for (let cursor = 0; cursor < queue.length; cursor++) {
  const pixel = queue[cursor];
  if (face[pixel]) continue;
  const i = pixel * 4, red = master[i], green = master[i + 1], blue = master[i + 2];
  if (!master[i + 3] || blue < 16 || blue < red * 1.12 || blue < green * 1.03) continue;
  face[pixel] = 1;
  const x = pixel % WIDTH, y = Math.floor(pixel / WIDTH);
  if (x > 0) queue.push(pixel - 1);
  if (x < WIDTH - 1) queue.push(pixel + 1);
  if (y > 0) queue.push(pixel - WIDTH);
  if (y < HEIGHT - 1) queue.push(pixel + WIDTH);
}
assert(face.reduce((sum, value) => sum + value, 0) > WIDTH * HEIGHT * .6, 'Missing inner stone face');

// Apply clean reference stone over the whole face, eliminating the central replacement patch.
const textureWidth = 34, textureHeight = 27;
const texture = await sharp(referencePath)
  .extract({ left: crop.left + 28, top: crop.top + 22, width: 65, height: 64 })
  .resize(textureWidth, textureHeight, { kernel: 'nearest', fit: 'fill' }).ensureAlpha().raw().toBuffer();
function stonePixel(x, y) {
  const tileX = Math.floor(x / textureWidth), tileY = Math.floor(y / textureHeight);
  let tx = (x % textureWidth + textureWidth) % textureWidth;
  let ty = (y % textureHeight + textureHeight) % textureHeight;
  if ((tileX + tileY) & 1) tx = textureWidth - 1 - tx;
  if (tileX & 1) ty = textureHeight - 1 - ty;
  return (ty * textureWidth + tx) * 4;
}
const topEdge = Array.from({ length: WIDTH }, (_, x) => {
  for (let y = 0; y < HEIGHT; y++) if (face[y * WIDTH + x]) return y;
  return HEIGHT;
});
function frame(hover = false, depth = 0) {
  const pixels = Buffer.from(master);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const i = (y * WIDTH + x) * 4;
    if (face[y * WIDTH + x]) {
      const sample = stonePixel(x, y - depth);
      const insetShadow = depth && y < topEdge[x] + depth ? .74 : 1;
      const brightness = (1 - depth * .105) * insetShadow;
      for (let channel = 0; channel < 3; channel++) pixels[i + channel] = Math.round(texture[sample + channel] * brightness);
    } else if (hover && pixels[i + 3] && pixels[i] > pixels[i + 2] * 1.3) {
      for (const [channel, gain] of [[0, 22], [1, 30], [2, 20]]) pixels[i + channel] = Math.min(255, pixels[i + channel] + gain);
    }
  }
  return pixels;
}
const states = [frame(), frame(true), frame(false, 2)];
const press = DEPTHS.map((depth, index) => frame(index === 1, depth));
press[7] = Buffer.from(press[0]);
const { ru, en } = await createButtonLabels(sharp);
function atlas(frames) {
  const pixels = Buffer.alloc(WIDTH * frames.length * HEIGHT * 4);
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) for (let y = 0; y < HEIGHT; y++) {
    frames[frameIndex].copy(pixels, (y * WIDTH * frames.length + frameIndex * WIDTH) * 4, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  return pixels;
}
async function saveAtlas(name, frames) {
  const raw = atlas(frames), width = WIDTH * frames.length, path = `${PUBLIC}/${name}`;
  await sharp(raw, { raw: { width, height: HEIGHT, channels: 4 } }).png().toFile(path);
  await copyFile(path, `${SOURCE}/${name}`);
  assert((await readFile(path)).equals(await readFile(`${SOURCE}/${name}`)), `Mismatched publication copy: ${name}`);
  const metadata = await sharp(path).metadata();
  assert.equal(metadata.width, width); assert.equal(metadata.height, HEIGHT);
  for (const pixels of frames) {
    assert.equal(pixels.length, WIDTH * HEIGHT * 4);
    for (const [x, y] of [[0, 0], [WIDTH - 1, 0], [0, HEIGHT - 1], [WIDTH - 1, HEIGHT - 1]]) {
      assert.equal(pixels[(y * WIDTH + x) * 4 + 3], 0, `Opaque corner: ${name}`);
    }
  }
}
await saveAtlas('frame-states.png', states);
await saveAtlas('frame-press.png', press);
await saveAtlas('labels-ru.png', ru);
await saveAtlas('labels-en.png', en);
assert(press[0].equals(press[7]), 'Press must return to its original pose');
assert(!states[0].equals(states[1]) && !states[0].equals(states[2]), 'States must be visibly different');
for (const pixels of [...states, ...press]) for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], master[i], 'Outer silhouette moved');

// A central-only dark patch fails this regression check: edge regions must darken as well.
const bands = {
  left: (x) => x < WIDTH / 4, right: (x) => x >= WIDTH * .75,
  top: (_, y) => y < HEIGHT / 3, bottom: (_, y) => y >= HEIGHT * 2 / 3,
  center: (x, y) => x > WIDTH / 3 && x < WIDTH * 2 / 3 && y > HEIGHT / 3 && y < HEIGHT * 2 / 3
};
const shadeReport = {};
for (const [name, includes] of Object.entries(bands)) {
  let idle = 0, down = 0, count = 0;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    if (!face[y * WIDTH + x] || !includes(x, y)) continue;
    const i = (y * WIDTH + x) * 4;
    for (let channel = 0; channel < 3; channel++) { idle += states[0][i + channel]; down += states[2][i + channel]; }
    count++;
  }
  assert(count > 20 && down / idle < .88, `Pressed shade does not cover the ${name} of the face`);
  shadeReport[name] = { pixels: count, pressedToIdle: down / idle };
}
function compositeLabel(background, label, depth = 0) {
  const result = Buffer.from(background);
  for (let y = 0; y < HEIGHT - depth; y++) for (let x = 0; x < WIDTH; x++) {
    const from = (y * WIDTH + x) * 4;
    if (label[from + 3]) label.copy(result, ((y + depth) * WIDTH + x) * 4, from, from + 4);
  }
  return result;
}
const animated = press.map((pixels, index) => compositeLabel(pixels, ru[0], DEPTHS[index]));
await sharp(Buffer.concat(animated), { raw: { width: WIDTH, height: HEIGHT * 8, channels: 4, pageHeight: HEIGHT } })
  .gif({ delay: Array(8).fill(60), loop: 0 }).toFile(`${ART}/press-preview.gif`);
const sheet = Buffer.alloc(WIDTH * 4 * HEIGHT * 5 * 4);
const sheetRow = (frames, row) => atlas(frames).copy(sheet, row * WIDTH * 4 * HEIGHT * 4);
states.forEach((pixels, row) => sheetRow([...ru, ...en].map(label => compositeLabel(pixels, label, row === 2 ? 2 : 0)), row));
sheetRow(animated.slice(0, 4), 3); sheetRow(animated.slice(4), 4);
await sharp(sheet, { raw: { width: WIDTH * 4, height: HEIGHT * 5, channels: 4 } }).png().toFile(`${ART}/contact-sheet.png`);
await sharp(states[0], { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).resize(960, 192, { kernel: 'nearest' }).png().toFile(`${ART}/blank-idle-4x.png`);
const bounds = {};
for (const [language, labels] of Object.entries({ ru, en })) bounds[language] = labels.map(pixels => {
  let left = WIDTH, top = HEIGHT, right = -1, bottom = -1;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (pixels[(y * WIDTH + x) * 4 + 3]) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert(right >= left && bottom >= top, 'Empty button caption');
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
});
await writeFile(`${PUBLIC}/manifest.json`, JSON.stringify(bounds, null, 2) + '\n');
await copyFile(`${PUBLIC}/manifest.json`, `${SOURCE}/manifest.json`);
await writeFile(`${ART}/verification.json`, JSON.stringify({ bounds, shadeCoverage: shadeReport, finalFrameMatchesIdle: true }, null, 2) + '\n');
console.log('Verified clean lettering, full-face shade, silhouettes, atlases and publication copies.');
