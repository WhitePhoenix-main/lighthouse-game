"""Export the runtime layers from the approved chronicle PNGs.

Run with Python 3, Pillow and NumPy from any directory:
    python tools/assets/prepare-chronicle-book.py
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
REFERENCES = ROOT / "art/concepts/chronicle-books-2026-11-18"
OUTPUT = ROOT / "public/images/chronicle/book"

SHEET = "campaign-desktop-sheet-1"
SECOND_SHEET = "campaign-desktop-sheet-2"
CAMPAIGN_MOBILE = "campaign-mobile-portrait"
TRIALS = "trials-desktop"
TRIALS_MOBILE = "trials-mobile-portrait"

# Crop coordinates are left, top, right, bottom in the original PNG.
ART = {
    "chapter-misty-shore": (SHEET, (137, 282, 777, 772), False),
    "chapter-misty-shore-wide": (CAMPAIGN_MOBILE, (96, 342, 855, 699), False),
    "first-light": (SHEET, (842, 125, 1158, 337), False),
    "broken-shore": (SHEET, (1165, 121, 1505, 337), True),
    "winged-tide": (SHEET, (840, 425, 1162, 634), False),
    "abyss-warden": (SHEET, (1173, 425, 1524, 634), False),
    "far-shore": (SECOND_SHEET, (845, 124, 1156, 336), False),
    "rescue-trial": (TRIALS, (842, 123, 1156, 336), True),
    "armored-front": (TRIALS, (1168, 124, 1503, 333), False),
    "sky-siege": (TRIALS, (843, 429, 1160, 637), False),
    "cross-current": (TRIALS, (1173, 429, 1524, 637), False),
    "rescue-trial-feature": (TRIALS, (137, 282, 777, 735), False),
    "rescue-trial-feature-wide": (TRIALS_MOBILE, (96, 340, 855, 693), False),
}

SPREAD_PAINT = [
    ART[name][1] for name in (
        "rescue-trial-feature", "rescue-trial", "armored-front", "sky-siege",
        "cross-current",
    )
]
SPREAD_TYPE = [
    (196, 107, 747, 227), (258, 240, 698, 281), (216, 744, 707, 779),
    (854, 339, 1146, 419), (1172, 337, 1509, 421),
    (849, 640, 1169, 726), (1189, 640, 1527, 725),
]
PORTRAIT_PAINT = [
    ART["rescue-trial-feature-wide"][1],
    (99, 770, 459, 987), (481, 772, 855, 987),
    (98, 1096, 461, 1301), (479, 1097, 858, 1301),
]
PORTRAIT_TYPE = [
    (147, 145, 816, 286), (210, 296, 748, 345), (113, 693, 843, 759),
    (113, 985, 461, 1093), (490, 985, 852, 1094),
    (103, 1298, 468, 1424), (485, 1298, 855, 1424),
]


def read(stem):
    with Image.open(REFERENCES / f"{stem}.png") as source:
        return source.convert("RGBA")


def pigments(pixels, remove_copper, first_light=False):
    red, green, blue = np.moveaxis(pixels[..., :3].astype(np.int16), 2, 0)
    if remove_copper:
        # The chosen tile has an orange outline outside the cool silhouette.
        return (blue > red - 9) & (blue > green - 13)
    cool = (blue > red - 15) | (red < 112)
    if first_light:
        # The beam reaches the right edge of its silhouette. Warm paper is
        # lighter than the outer beam and has a smaller red/green separation.
        cool[25:144, 202:] |= (
            (red - green > 50) | (red < 177)
        )[25:144, 202:]
    return cool


def fill_enclosed(mask):
    """Keep warm pixels inside the art, including lit windows and the moon."""
    surrounded = Image.fromarray(np.pad(mask, 1).astype(np.uint8) * 255).copy()
    ImageDraw.floodfill(surrounded, (0, 0), 127)
    return np.asarray(surrounded)[1:-1, 1:-1] != 127


def connected_center(mask):
    """Ignore isolated dark pixels from the paper and neighboring prints."""
    height, width = mask.shape
    center = (height // 2, width // 2)
    remaining = mask.copy()
    result = np.zeros_like(mask)
    remaining[center] = False
    result[center] = True
    queue = deque([center])
    while queue:
        y, x = queue.popleft()
        for row, col in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= row < height and 0 <= col < width and remaining[row, col]:
                remaining[row, col] = False
                result[row, col] = True
                queue.append((row, col))
    return result


def save(image, name):
    image.save(OUTPUT / (name + ".png"), optimize=True)


def export_art(sources):
    for name, (stem, crop, selected) in ART.items():
        source = np.array(sources[stem].crop(crop))
        mask = fill_enclosed(
            connected_center(pigments(source, selected, first_light=name == "first-light"))
        )
        source[~mask] = 0
        source[mask, 3] = 255
        save(Image.fromarray(source), name)
        if name == "first-light":
            export_unlit(source)


def export_unlit(pixels):
    # Preserve the silhouette and the tiny wick lights. Restore the sky
    # behind the ray with an unlit cloud sample from the same vignette.
    red, green, blue = np.moveaxis(pixels[..., :3].astype(float), 2, 0)
    beam = Image.new("L", (pixels.shape[1], pixels.shape[0]))
    ImageDraw.Draw(beam).polygon(
        [(210, 57), (316, 22), (316, 127), (210, 85)], fill=255
    )
    beam_alpha = np.asarray(beam.filter(ImageFilter.GaussianBlur(2))) / 255.0
    cloud = Image.fromarray(pixels[55:131, 17:89, :3]).resize(
        (108, 114), Image.Resampling.NEAREST
    )
    unlit = pixels.copy()
    region = unlit[20:134, 208:, :3]
    strength = beam_alpha[20:134, 208:, None]
    region[:] = np.rint(region + (np.asarray(cloud).astype(float) - region) * strength)

    # The colored wake becomes the same blue as the surrounding night sea.
    warm = np.clip((red - blue - 8) / 32, 0, 1)
    neutral = np.stack(
        (15 + 0.35 * blue, 31 + 0.43 * blue, 61 + 0.63 * blue), axis=2
    )
    sea = unlit[134:, :181, :3]
    sea[:] = np.rint(
        sea + (neutral[134:, :181] - sea) * warm[134:, :181, None]
    )
    unlit[unlit[..., 3] == 0] = 0
    save(Image.fromarray(unlit), "first-light-unlit")


def box_blur(array, radius):
    """Floating point blur keeps the weighted paper samples continuous."""
    result = array
    for axis in (0, 1):
        edges = [(0, 0)] * result.ndim
        edges[axis] = (radius, radius)
        padded = np.pad(result, edges, mode="edge")
        edges[axis] = (1, 0)
        integral = np.cumsum(np.pad(padded, edges), axis=axis, dtype=np.float64)
        window = 2 * radius + 1
        high = [slice(None)] * result.ndim
        low = high.copy()
        high[axis] = slice(window, None)
        low[axis] = slice(None, -window)
        result = (integral[tuple(high)] - integral[tuple(low)]) / window
    return result


def paper_texture(source, width, height):
    # A genuinely unprinted patch from the second night spread. Mirror the
    # repeat so the small-scale grain has no seam on the large portrait page.
    sample = np.array(source.crop((875, 394, 1496, 724)), dtype=np.float32)[..., :3]
    grain = sample - box_blur(sample, 35)
    mirror_x = np.concatenate((grain, np.roll(grain, 138, axis=0)), axis=1)
    tile = np.concatenate((mirror_x, mirror_x[::-1]), axis=0)
    return np.tile(
        tile, (1 + height // tile.shape[0], 1 + width // tile.shape[1], 1)
    )[:height, :width]


def erase_print(source, illustration_crops, text_crops, paper):
    # Work only inside the printed face. The original spine, fittings, leaf
    # edges and transparent exterior stay at their native coordinates.
    pixels = np.array(source)
    ink = np.zeros(pixels.shape[:2], dtype=bool)
    for x1, y1, x2, y2 in (*illustration_crops, *text_crops):
        ink[y1:y2, x1:x2] = True
    expanded = Image.fromarray(ink.astype(np.uint8) * 255).filter(
        ImageFilter.MaxFilter(15)
    )
    opacity = np.asarray(expanded.filter(ImageFilter.GaussianBlur(3))) / 255.0
    red, green, blue, alpha = np.moveaxis(pixels, 2, 0)
    samples = (np.asarray(expanded) == 0) & (red >= 205) & (green >= 161) & (
        blue >= 125
    ) & (alpha > 240)

    rgb = pixels[..., :3].astype(np.float32)
    weighted = np.dstack((rgb * samples[..., None], samples))
    # Broad estimates fill illustrations. Narrower estimates follow the
    # original variation near their edges and in the openings between lines.
    replacement = np.broadcast_to(np.median(rgb[samples], axis=0), rgb.shape).copy()
    for radius in (360, 210, 135, 78, 44, 25):
        average = box_blur(weighted, radius)
        support = average[..., 3:4]
        amount = np.clip(support / 0.21, 0, 1)
        local = average[..., :3] / np.maximum(support, 1e-12)
        replacement += (local - replacement) * amount
    replacement += paper_texture(paper, source.width, source.height) * 0.60
    pixels[..., :3] = np.clip(
        np.rint(rgb + (replacement - rgb) * opacity[..., None]), 0, 255
    ).astype(np.uint8)
    # Nearly transparent stray pixels originate in the generated reference.
    pixels[pixels[..., 3] < 9] = 0
    return Image.fromarray(pixels)


def export_bookmark(source):
    crop = (688, 18, 989, 122)
    image = source.crop(crop)
    mask = Image.new("L", image.size)
    ImageDraw.Draw(mask).polygon(
        [
            (10, 8), (278, 8), (278, 16), (288, 16), (288, 30),
            (297, 30), (297, 98), (277, 98), (277, 87), (247, 77),
            (216, 79), (179, 90), (150, 101), (120, 90), (92, 80),
            (65, 77), (36, 87), (21, 98), (2, 98), (2, 32), (10, 32),
        ],
        fill=255,
    )

    # Sample the uninterrupted blue rows above and below the printed heading.
    # Repeat their grain across each replacement row with a vertical gradient.
    pixels = np.array(image)
    top = pixels[18:23, 32:258].astype(float)
    bottom = pixels[49:54, 32:258].astype(float)
    for y in range(23, 49):
        amount = (y - 23) / 26
        pixels[y, 32:258] = np.rint(
            top[(y - 23) % 5] * (1 - amount) + bottom[(y - 23) % 5] * amount
        ).astype(np.uint8)
    pixels[..., 3] = np.minimum(pixels[..., 3], np.asarray(mask))
    red, green, blue = np.moveaxis(pixels[..., :3].astype(np.int16), 2, 0)
    pixels[(green > 115) & (red - green < 54) & (blue < red - 15), 3] = 0
    pixels[pixels[..., 3] == 0] = 0
    save(Image.fromarray(pixels), "bookmark")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = {
        stem: read(stem)
        for stem in (SHEET, SECOND_SHEET, CAMPAIGN_MOBILE, TRIALS, TRIALS_MOBILE)
    }
    export_art(sources)
    export_bookmark(sources[SHEET])
    paper = sources[SECOND_SHEET]
    spread = erase_print(sources[TRIALS], SPREAD_PAINT, SPREAD_TYPE, paper)
    # The second sheet has unprinted original paper below the card row.
    # Preserve its detailed physical paper marks on the right-hand face.
    clean_right = Image.new("L", spread.size)
    ImageDraw.Draw(clean_right).rectangle((874, 408, 1490, 713), fill=255)
    clean_right = clean_right.filter(ImageFilter.GaussianBlur(12))
    spread.paste(paper, (0, 0), clean_right)
    save(spread, "spread")

    portrait = Image.new("RGBA", (956, 1646))
    portrait.paste(sources[TRIALS_MOBILE], (0, 0))
    save(erase_print(portrait, PORTRAIT_PAINT, PORTRAIT_TYPE, paper), "portrait")


if __name__ == "__main__":
    main()
