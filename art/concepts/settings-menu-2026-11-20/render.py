"""Composite the settings proposal over the unchanged camera of the main menu."""

import json
import re
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CAPTURES = ROOT / "test-results/settings-menu-reference"
PUBLIC = ROOT / "public"
MENU = PUBLIC / "images/menu-buttons-v2"
FONT = PUBLIC / "fonts/menu/VollkornSC-Regular.ttf"
NEAREST = Image.Resampling.NEAREST
FORMATS = {
    "desktop": (1280, 720, 2),
    "landscape": (720, 360, 1),
    "portrait": (360, 640, 1),
    "tall": (390, 844, 1),
}
COPY = {
    "ru": ("Звук", "Вкл", "Выкл", "Музыка", "Звуки", "Язык", "Авто", "Русский",
           "English", "Размер текста", "Обычный", "Крупный", "Назад"),
    "en": ("Sound", "On", "Off", "Music", "Effects", "Language", "Auto", "Русский",
           "English", "Text size", "Normal", "Large", "Back"),
}
CREAM = "#f3dfba"
GOLD = "#ffc671"
MUTED = "#c9d2dc"
SHADOW = "#071221"
CHOICE_INK = "#e0d4bd"
SELECTED_INK = "#ffd6a3"
MENU_INK = ("#ffe3ad", "#ffc671", "#e89a48", "#8f4822", "#1d1312")
MENU_LABELS = {"ru": ("ИГРАТЬ", "НАСТРОЙКИ"), "en": ("PLAY", "SETTINGS")}


def blank(size):
    return Image.new("RGBA", size)


def tint_panel(source):
    def color(rgba):
        r, g, b, a = rgba
        if not a:
            return (0, 0, 0, 0)
        if r > b + 24:
            return (r * 45 // 100, g * 53 // 100, b * 65 // 100, a)
        return (12 + r * 22 // 100, 25 + g * 22 // 100, 42 + b * 23 // 100, a)

    result = blank(source.size)
    result.putdata([color(rgba) for rgba in source.get_flattened_data()])
    return result


def nine_slice(source, size, inset):
    w, h = size
    result = blank(size)
    sx, sy = inset
    source_x, source_y = (0, sx, source.width - sx, source.width), (0, sy, source.height - sy, source.height)
    dest_x, dest_y = (0, sx, w - sx, w), (0, sy, h - sy, h)
    assert min(w - 2 * sx, h - 2 * sy) > 0
    for row in range(3):
        for column in range(3):
            x, y = dest_x[column], dest_y[row]
            dw, dh = dest_x[column + 1] - x, dest_y[row + 1] - y
            piece = source.crop((source_x[column], source_y[row], source_x[column + 1], source_y[row + 1]))
            if row == column == 1:
                for yy in range(0, dh, piece.height):
                    for xx in range(0, dw, piece.width):
                        result.paste(piece.crop((0, 0, min(dw - xx, piece.width), min(dh - yy, piece.height))), (x + xx, y + yy))
            else:
                result.paste(piece.resize((dw, dh), NEAREST), (x, y))
    return result


def make_sprites():
    states = Image.open(MENU / "frame-states.png").convert("RGBA")
    default = states.crop((0, 0, 240, 48))
    press = Image.open(MENU / "frame-press.png").convert("RGBA")
    sprites = {
        "panel": tint_panel(default.resize((120, 24), NEAREST)),
        "idle": default,
        "hover": states.crop((240, 0, 480, 48)),
        "pressed": press.crop((4 * 240, 0, 5 * 240, 48)),
        "thumb": Image.open(PUBLIC / "images/avalon-watch/ui/slider-thumb.png").convert("RGBA"),
        "track": blank((24, 8)),
        "fill": blank((24, 8)),
        "choice-tray": blank((32, 24)),
        "choice-selected": blank((32, 24)),
        "check": blank((8, 7)),
        "back": blank((8, 11)),
    }
    for name, edge, face in (
        ("choice-tray", "#3b526b", "#0c1b2c"),
        ("choice-selected", "#956b4d", "#203e59"),
    ):
        draw = ImageDraw.Draw(sprites[name])
        draw.polygon([(0, 3), (3, 0), (28, 0), (31, 3), (31, 20),
                      (28, 23), (3, 23), (0, 20)], fill=edge)
        draw.polygon([(1, 4), (4, 1), (27, 1), (30, 4), (30, 19),
                      (27, 22), (4, 22), (1, 19)], fill=face)
    draw = ImageDraw.Draw(sprites["choice-tray"])
    draw.line((4, 1, 27, 1), fill="#071321")
    draw = ImageDraw.Draw(sprites["choice-selected"])
    draw.line((4, 1, 27, 1), fill="#53677b")
    draw.line((4, 22, 27, 22), fill="#795338")
    draw.line((4, 23, 27, 23), fill="#e6a16a")
    for name, face, edge, light in (
        ("track", "#101e30", "#071322", "#3a526c"),
        ("fill", "#946448", "#553923", "#c78e63"),
    ):
        draw = ImageDraw.Draw(sprites[name])
        draw.polygon([(0, 2), (2, 0), (21, 0), (23, 2), (23, 5), (21, 7), (2, 7), (0, 5)], fill=edge)
        draw.rectangle((2, 2, 21, 5), fill=face)
        draw.line((2, 3, 21, 3), fill=light)
    draw = ImageDraw.Draw(sprites["check"])
    draw.line([(0, 4), (2, 6), (7, 1)], fill="#51351f", width=2)
    draw.line([(0, 3), (2, 5), (7, 0)], fill=GOLD, width=2)
    draw = ImageDraw.Draw(sprites["back"])
    draw.polygon([(5, 0), (7, 0), (2, 5), (7, 10), (5, 10), (0, 5)], fill=GOLD)
    return sprites


SPRITES = make_sprites()


def export_sprites():
    sheet = blank((496, 112))
    cells = {}
    frames = {
        "idle": (4, 4), "hover": (252, 4), "pressed": (4, 56),
        "panel": (252, 56),
    }
    for name, (x, y) in frames.items():
        sprite = SPRITES[name]
        sheet.alpha_composite(sprite, (x, y))
        cells[name] = {"rect": [x, y, *sprite.size],
                       "slice": [5, 8, 5, 8] if name == "panel" else [11, 16, 11, 16]}
    for name, x in (("track", 252), ("fill", 280), ("thumb", 308), ("check", 324), ("back", 340)):
        sprite = SPRITES[name]
        sheet.alpha_composite(sprite, (x, 84))
        cells[name] = {"rect": [x, 84, *sprite.size]}
    for name, x in (("choice-tray", 380), ("choice-selected", 416)):
        sprite = SPRITES[name]
        sheet.alpha_composite(sprite, (x, 56))
        cells[name] = {"rect": [x, 56, *sprite.size], "slice": [4, 4, 4, 4]}
    for name in ("track", "fill"):
        cells[name]["horizontalCaps"] = 2
    assert sheet.getchannel("A").getextrema() == (0, 255)
    sheet.save(HERE / "controls.png", optimize=True)
    (HERE / "controls.json").write_text(json.dumps(cells, indent=2) + "\n", encoding="utf8")


def load_letterforms():
    source = (ROOT / "src/presentation/shared/settingsLettering.ts").read_text(encoding="utf8")
    forms = {
        quoted or bare: re.findall(r"[01]{8}", rows)
        for quoted, bare, rows in re.findall(r"(?:'(.)'|\b([A-Z])):\s*\[((?:\s*'[01]{8}'\s*,?){9})\]", source)
    }
    for latin, cyrillic in re.findall(r"\b([A-Z]):'([А-Я])'", source):
        forms[latin] = forms[cyrillic]
    face_colors = {tuple(bytes.fromhex(ink[1:])) + (255,) for ink in MENU_INK[:3]}
    for language, labels in MENU_LABELS.items():
        atlas = Image.open(MENU / f"labels-{language}.png").convert("RGBA")
        for index, label in enumerate(labels):
            left = index * 240 + (240 - (len(label) * 18 - 2)) // 2
            for letter, char in enumerate(label):
                forms[char] = [
                    "".join(
                        "1" if atlas.getpixel((left + letter * 18 + column * 2, 13 + row * 2)) in face_colors else "0"
                        for column in range(8)
                    )
                    for row in range(9)
                ]
    return forms


LETTERFORMS = load_letterforms()


@lru_cache(maxsize=None)
def menu_lettering(text, scale, color=None, advance=18):
    # Master grid and relief match the published command labels at their native size.
    lines = [Image.new("L", (len(text) * 18 + 2, 24)) for _ in range(3)]
    rows = [ImageDraw.Draw(line) for line in lines]
    accent = Image.new("L", lines[0].size)
    x = 0
    for char in text.upper():
        if char == " ":
            x += 10
            continue
        for row, bits in enumerate(LETTERFORMS[char]):
            draw = rows[0 if row < 2 else 1 if row < 6 else 2]
            for column, bit in enumerate(bits):
                if bit == "1":
                    px, py = x + column * 2, 3 + row * 2
                    draw.rectangle((px, py, px + 1, py + 1), fill=255)
        if char == "Й":
            pen = ImageDraw.Draw(accent)
            pen.point([(x + 4, 0), (x + 11, 0)], fill=255)
            pen.line((x + 5, 1, x + 10, 1), fill=255)
        x += advance

    face = ImageChops.lighter(ImageChops.lighter(*lines[:2]), lines[2])
    result = blank((face.width + 2, face.height + 3))
    if color:
        result.paste(SHADOW, (2, 2, 2 + face.width, 2 + face.height), face)
        result.paste(color, (0, 0, *face.size), ImageChops.lighter(face, accent))
    else:
        for dx, dy, ink in ((2, 3, MENU_INK[4]), (0, 2, MENU_INK[3])):
            result.paste(ink, (dx, dy, dx + face.width, dy + face.height), face)
        for row, ink in zip(lines, MENU_INK[:3], strict=True):
            result.paste(ink, (0, 0, *face.size), row)
        result.paste(MENU_INK[0], (0, 0, *face.size), accent)
    label = result.crop(result.getbbox())
    if scale == 2:
        return label
    return label.resize((round(label.width * scale / 2), round(label.height * scale / 2)), NEAREST)


def verify_menu_lettering():
    for language, labels in MENU_LABELS.items():
        atlas = Image.open(MENU / f"labels-{language}.png").convert("RGBA")
        for index, label in enumerate(labels):
            cell = atlas.crop((index * 240, 0, (index + 1) * 240, 48))
            assert cell.crop(cell.getbbox()).tobytes() == menu_lettering(label, 2).tobytes(), label


class Board:
    def __init__(self, size, large):
        self.layer = blank(size)
        self.draw = ImageDraw.Draw(self.layer)
        self.large = large
        self.targets = []

    def text(self, label, x, cy, size, color=CREAM, align="left", limit=None, advance=18):
        stamp = menu_lettering(label, size * (1.12 if self.large else 1), color, advance)
        w, h = stamp.size
        if limit is not None:
            assert w <= limit, (label, w, limit)
        if align == "center":
            x -= w // 2
        if align == "right":
            x -= w
        self.layer.alpha_composite(stamp, (x, cy - h // 2))
        return w

    def title(self, language, x, cy):
        atlas = Image.open(MENU / f"labels-{language}.png").convert("RGBA")
        rect = atlas.crop((240, 0, 480, 48))
        mark = rect.crop(rect.getbbox())
        assert mark.width in (144, 162)
        if self.large:
            mark = mark.resize((round(mark.width * 1.12), round(mark.height * 1.12)), NEAREST)
        self.layer.alpha_composite(mark, (x - mark.width // 2, cy - mark.height // 2))

    def panel(self, rect):
        x, y, w, h = rect
        slab = nine_slice(SPRITES["panel"], (w, h), inset=(8, 5))
        shade = blank(slab.size)
        shade.putalpha(slab.getchannel("A").point(lambda a: a * 3 // 4))
        self.layer.alpha_composite(shade, (x + 1, y + 3))
        self.layer.alpha_composite(slab, (x, y))

    def rule(self, x, y, w, vertical=False):
        if vertical:
            self.draw.line((x, y, x, y + w), fill="#0a1526")
            self.draw.line((x + 1, y, x + 1, y + w), fill="#354258")
        else:
            self.draw.line((x, y, x + w, y), fill="#0a1526")
            self.draw.line((x, y + 1, x + w, y + 1), fill="#354258")

    def back_button(self, label, x, y):
        frame = SPRITES["idle"]
        w, h = frame.size
        self.targets.append((x, y, w, h))
        self.layer.alpha_composite(frame, (x, y))
        center = x + w // 2 + 8
        cy = y + h // 2
        ink_width = self.text(label, center, cy, 2, None, "center", w - 24)
        self.layer.alpha_composite(SPRITES["back"], (center - ink_width // 2 - 16, cy - 6))

    def choices(self, labels, x, y, widths, h, size, selected, advance=18):
        tray = nine_slice(SPRITES["choice-tray"], (sum(widths), h - 4), inset=(4, 4))
        self.layer.alpha_composite(tray, (x, y + 2))
        for index, (label, width) in enumerate(zip(labels, widths, strict=True)):
            self.targets.append((x, y, width, h))
            if index:
                self.draw.line((x, y + 7, x, y + h - 8), fill="#33475b")
            center = x + width // 2
            active = index == selected
            if active:
                frame = nine_slice(SPRITES["choice-selected"], (width - 4, h - 8), inset=(4, 4))
                self.layer.alpha_composite(frame, (x + 2, y + 4))
                self.layer.alpha_composite(SPRITES["check"], (center - 4, y + (5 if h < 40 else 9)))
            self.text(label, center, y + h // 2 + 3, size,
                      SELECTED_INK if active else CHOICE_INK, "center", width - 10, advance=advance)
            x += width

    def slider(self, label, value, x, y, w, h, size):
        self.targets.append((x, y, w, h))
        caption = self.text(label, x, y + 8, size)
        number = self.text(f"{value}%", x + w, y + 8, size, GOLD, "right")
        assert caption + number + 5 <= w, (label, w)
        ty = y + h - 12
        track_width = w - 8
        tx = x + 4
        end = tx + round((track_width - 1) * value / 100)
        track = ImageDraw.Draw(self.layer)
        for tick in range(5):
            px = tx + round((track_width - 1) * tick / 4)
            track.line((px, ty + 7, px, ty + 9), fill="#577085")
        self.strip("track", tx, ty, track_width)
        if value:
            self.strip("fill", tx, ty, max(5, end - tx + 1))
        thumb = SPRITES["thumb"]
        self.layer.alpha_composite(thumb, (end - thumb.width // 2, ty + 3 - thumb.height // 2))

    def strip(self, name, x, y, width):
        sprite = SPRITES[name]
        crop = sprite.crop
        self.layer.alpha_composite(crop((0, 0, 2, 8)), (x, y))
        self.layer.alpha_composite(crop((2, 0, 22, 8)).resize((width - 4, 8), NEAREST), (x + 2, y))
        self.layer.alpha_composite(crop((22, 0, 24, 8)), (x + width - 2, y))

    def verify_targets(self, scale):
        assert len(self.targets) == 10
        for index, (x, y, w, h) in enumerate(self.targets):
            assert min(w, h) * scale >= 44
            assert x >= 0 and y >= 0 and x + w <= self.layer.width and y + h <= self.layer.height
            for x2, y2, w2, h2 in self.targets[index + 1:]:
                assert x + w <= x2 or x2 + w2 <= x or y + h <= y2 or y2 + h2 <= y


def mockup(device, language, large):
    width, height, scale = FORMATS[device]
    w, h = width // scale, height // scale
    board = Board((w, h), large)
    sound, on, off, music, effects, lang, auto, ru, en, text, normal, big, back = COPY[language]
    if device == "desktop":
        board.title(language, 138, 46)
        board.panel((18, 70, 240, 224))
        board.text(sound, 34, 92, 1.4)
        board.choices((on, off), 114, 77, (64, 64), 32, 1.22, 0)
        board.slider(music, 50, 34, 112, 208, 32, 1.22)
        board.slider(effects, 70, 34, 145, 208, 32, 1.22)
        board.rule(34, 181, 207)
        board.text(lang, 34, 195, 1.28)
        board.choices((auto, ru, en), 34, 204, (52, 78, 78), 32, 1.07, 2 if language == "en" else 0, advance=16)
        board.text(text, 34, 247, 1.28)
        board.choices((normal, big), 34, 257, (104, 104), 32, 1.22, int(large))
        board.back_button(back, 18, 305)
    elif device == "landscape":
        board.title(language, 178, 38)
        board.panel((58, 60, 354, 218))
        board.text(sound, 70, 92, 1.23)
        board.choices((on, off), 70, 104, (58, 58), 44, 1.13, 0)
        board.slider(music, 50, 70, 157, 116, 44, 1.06)
        board.slider(effects, 70, 70, 209, 116, 44, 1.06)
        board.rule(193, 77, 185, vertical=True)
        board.text(lang, 200, 92, 1.23)
        board.choices((auto, ru, en), 200, 104, (48, 76, 76), 44, 1.04, 2 if language == "en" else 0, advance=16)
        board.text(text, 200, 197, 1.23)
        board.choices((normal, big), 200, 211, (100, 100), 44, 1.16, int(large))
        board.back_button(back, 58, 300)
    else:
        y = h - 274
        board.panel((12, y, w - 24, 214))
        board.title(language, w // 2, y + 18)
        board.text(sound, 26, y + 57, 1.26)
        group_width = w - 138
        halves = (group_width // 2, group_width - group_width // 2)
        board.choices((on, off), 112, y + 35, halves, 44, 1.16, 0)
        slider_width = (w - 68) // 2
        board.slider(music, 50, 26, y + 79, slider_width, 44, 1.15)
        board.slider(effects, 70, w - 26 - slider_width, y + 79, slider_width, 44, 1.15)
        board.text(lang, 26, y + 145, 0.98 if language == "en" else 1.17, limit=80)
        language_widths = (54, (group_width - 54) // 2, (group_width - 53) // 2)
        board.choices((auto, ru, en), 112, y + 123, language_widths, 44, 1.10, 2 if language == "en" else 0, advance=17)
        first_word, second_word = text.split(" ")
        board.text(first_word, 26, y + 183, 1.12, limit=80)
        board.text(second_word, 26, y + 197, 1.12, limit=80)
        board.choices((normal, big), 112, y + 167, halves, 44, 1.16, int(large))
        board.back_button(back, (w - 240) // 2, h - 54)

    board.verify_targets(scale)
    layer = board.layer.resize((width, height), NEAREST)
    base = Image.open(CAPTURES / f"{device}-coast.png").convert("RGBA")
    assert base.size == layer.size
    render = Image.alpha_composite(base, layer)
    changed = ImageChops.difference(base.convert("RGB"), render.convert("RGB"))
    transparent = layer.getchannel("A").point(lambda a: 0 if a else 255)
    assert Image.composite(changed, Image.new("RGB", render.size), transparent).getbbox() is None
    return render.convert("RGB")


def comparison(device, proposal, output):
    main = Image.open(CAPTURES / f"{device}-menu.png").convert("RGB")
    assert main.size == proposal.size
    w, h = main.size
    band = 36
    gutter = 8
    pair = Image.new("RGB", (w * 2 + gutter, h + band), "#102237")
    draw = ImageDraw.Draw(pair)
    font = ImageFont.truetype(str(FONT), 16)
    for x, label, frame in ((0, "Главное меню", main), (w + gutter, "Настройки · референс", proposal)):
        draw.text((x + 12, 8), label, font=font, fill=CREAM)
        draw.text((x + w - 12, 12), f"{w} × {h}", anchor="rt", font=font, fill=MUTED)
        pair.paste(frame, (x, band))
    pair.save(output, optimize=True)


def main():
    verify_menu_lettering()
    export_sprites()
    for device in FORMATS:
        for language in COPY:
            for large in (False, True):
                rendered = mockup(device, language, large)
                if language == "ru" and not large and device != "tall":
                    rendered.save(HERE / f"{device}.png", optimize=True)
                    comparison(device, rendered, HERE / f"compare-{device}.png")
                else:
                    size = "large" if large else "normal"
                    rendered.save(CAPTURES / f"{device}-{language}-{size}.png", optimize=True)
    print("Verified four original menu labels, 16 mockups, 44 px targets and unchanged scenery outside the panel.")


if __name__ == "__main__":
    main()
