import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Historical static-menu previews belong in ignored test results, outside the publication.
// sharp is supplied externally, never shipped with the game.
const { default: sharp } = await import(process.env.LIGHTHOUSE_SHARP_PATH
  ? pathToFileURL(process.env.LIGHTHOUSE_SHARP_PATH).href : 'sharp');
const inputs = process.argv.slice(2);
if (inputs.length !== 2) throw new Error('Usage: node tools/archive/compress-menu-images.mjs landscape.png portrait.png');
const target = new URL('../../test-results/archive/static-menu/', import.meta.url);
await mkdir(target, { recursive: true });
for (const [index, input] of inputs.entries()) {
  const name = index === 0 ? 'menu-landscape.webp' : 'menu-portrait.webp';
  const output = new URL(name, target);
  await sharp(input).rotate().resize({ width: index === 0 ? 1672 : 1024, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(fileURLToPath(output));
  console.log(`${name}: ${(await stat(output)).size} bytes (source ${(await stat(input)).size})`);
}
