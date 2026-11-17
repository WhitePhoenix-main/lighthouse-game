import { copyFile, mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';

// Publish the existing, lossless PNG sheets without processing or runtime dependencies.
const source = new URL('../../sprites/', import.meta.url);
const target = new URL('../../public/images/menu-sprites/', import.meta.url);
await mkdir(target, { recursive: true });
const ambient = JSON.parse(await readFile(new URL('ambient-manifest.json', source), 'utf8'));
const files = new Set(['background.png', 'moon.png', 'ship.png', 'sail.png', 'ship-wake.png', 'lantern-halo.png', 'window-glow.png', 'title.png',
  ...ambient.layers.map(layer => layer.file)]);
for (const file of files) {
  // Manifest references are intentionally restricted to files beside the existing sprite sheets.
  if (!/^[a-z0-9-]+\.png$/.test(file)) throw new Error(`Invalid scenery filename: ${file}`);
  const output = new URL(file, target);
  await copyFile(new URL(file, source), output);
  console.log(`${file}: ${(await stat(output)).size} bytes`);
}
// Discard obsolete generated publication copies; the authoring originals stay in sprites/.
for (const file of await readdir(target)) {
  if (/^(clouds|grass|waves)-[a-z0-9-]+\.png$/.test(file) && !files.has(file)) {
    await unlink(new URL(file, target));
  }
}

// Button authoring is separate; publication only copies the checked, lossless atlases.
const buttonSource = new URL('../../sprites/menu-buttons-v2/', import.meta.url);
const buttonTarget = new URL('../../public/images/menu-buttons-v2/', import.meta.url);
await mkdir(buttonTarget, { recursive: true });
for (const file of ['frame-states.png', 'frame-press.png', 'labels-ru.png', 'labels-en.png', 'manifest.json']) {
  const output = new URL(file, buttonTarget);
  await copyFile(new URL(file, buttonSource), output);
  console.log(`menu-buttons-v2/${file}: ${(await stat(output)).size} bytes`);
}
