import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Authoring dependency only. Lossless encoding preserves the reference letter pixels.
const { default: sharp } = await import(process.env.LIGHTHOUSE_SHARP_PATH
  ? pathToFileURL(process.env.LIGHTHOUSE_SHARP_PATH).href : 'sharp');
const target = new URL('../../test-results/archive/settings/', import.meta.url);
await mkdir(target, { recursive: true });
for (const orientation of ['landscape', 'portrait']) {
  const input = new URL(`../../art/concepts/arthurian-lighthouse/settings-${orientation}-pixel.png`, import.meta.url);
  const output = new URL(`settings-${orientation}.webp`, target);
  const image = sharp(fileURLToPath(input));
  // Only the actual panel is needed; all sprite coordinates remain the original ones.
  if (orientation === 'landscape') image.extract({ left: 0, top: 0, width: 990, height: 941 });
  await image.webp({ lossless: true, effort: 6 }).toFile(fileURLToPath(output));
  console.log(`${orientation}: ${(await stat(output)).size} bytes`);
}
