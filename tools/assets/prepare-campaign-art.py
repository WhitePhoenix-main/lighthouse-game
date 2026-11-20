"""Slice campaign ImageGen masters and pack sprites for the game."""
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
MASTERS = ROOT / "art" / "campaign-f" / "masters"
OUTPUT = ROOT / "public" / "images" / "campaign"
TILE = 160


def sprite_atlas(source, output, x_edges, y_edges, count):
    with Image.open(MASTERS / source) as master:
        columns = len(x_edges) - 1
        atlas = Image.new("RGBA", (columns * TILE, (len(y_edges) - 1) * TILE))
        for index in range(count):
            row, column = divmod(index, columns)
            sprite = master.crop((x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]))
            bounds = sprite.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
            if bounds is None:
                raise ValueError(f"Missing sprite {index} in {source}")
            sprite = ImageOps.contain(sprite.crop(bounds), (TILE - 10, TILE - 10), Image.Resampling.LANCZOS)
            x = column * TILE + (TILE - sprite.width) // 2
            y = row * TILE + (TILE - sprite.height) // 2
            atlas.alpha_composite(sprite, (x, y))
        atlas.save(OUTPUT / output, "WEBP", lossless=True, method=6)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with Image.open(MASTERS / "chapter-atlas.png") as master:
        for index in range(8):
            row, column = divmod(index, 2)
            x, y = column * 768, row * 256
            name = f"chapter-{index + 1}.webp" if index < 7 else "epilogue.webp"
            master.crop((x + 4, y + 3, x + 762, y + 253)).save(OUTPUT / name, "WEBP", quality=86, method=6)
    sprite_atlas("enemy-atlas.png", "enemies.webp", (0, 318, 632, 944, 1268), (0, 304, 607, 912, 1240), 14)
    sprite_atlas("boss-atlas.png", "bosses.webp", (0, 444, 887, 1330, 1774), (0, 435, 887), 8)
    sprite_atlas("warden-atlas.png", "warden.webp", (0, 887, 1774), (0, 887), 2)


if __name__ == "__main__":
    main()
