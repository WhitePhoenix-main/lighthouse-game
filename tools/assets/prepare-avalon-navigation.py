"""Export the native-pixel materials used by the Avalon Watch navigation screens."""

import sys
from pathlib import Path
from types import SimpleNamespace

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "art" / "concepts" / "avalon-watch" / "source"))
from kit import bevel
from navigation import pin, rail, recess, ring, scrollpaper, seal, wood

OUT = ROOT / "public" / "images" / "avalon-watch" / "navigation"


def export(name, image):
    image.save(OUT / f"{name}.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    plank_sheet = Image.new("RGBA", (180, 112))
    wood(SimpleNamespace(im=plank_sheet), 0, 0, 180, 112)
    export("wood-planks", plank_sheet.crop((12, 0, 168, 88)))
    export("wood-brace", plank_sheet.crop((3, 4, 9, 51)))

    leaf = Image.new("RGBA", (96, 72))
    scrollpaper(SimpleNamespace(im=leaf), 0, 0, 94, 70)
    export("paper-leaf", leaf)

    cover = Image.new("RGBA", (52, 34))
    d = ImageDraw.Draw(cover)
    bevel(d, 0, 0, 51, 33, 7, "#070f19")
    bevel(d, 2, 1, 49, 29, 6, "#63412f")
    bevel(d, 3, 1, 48, 27, 6, "#536177")
    bevel(d, 5, 3, 46, 25, 6, "#253953")
    export("book-cover", cover)

    copper = Image.new("RGBA", (48, 4))
    rail(ImageDraw.Draw(copper), 0, 1, 48)
    export("copper-rail", copper)

    brass_pin = Image.new("RGBA", (9, 10))
    pin(ImageDraw.Draw(brass_pin), 4, 4)
    export("brass-pin", brass_pin)

    wax = Image.new("RGBA", (29, 39))
    seal(SimpleNamespace(im=wax, icon=lambda *_: None), 14, 14, True)
    export("wax-seal", wax)

    for selected in (False, True):
        cell = Image.new("RGBA", (52, 62))
        recess(SimpleNamespace(im=cell), 0, 0, 52, 62, selected)
        export("recess-selected" if selected else "recess", cell)

    dial = Image.new("RGBA", (96, 96))
    d = ImageDraw.Draw(dial)
    ring(d, 48, 45, 40, "#55594f", 36)
    ring(d, 48, 45, 36, "#313f42", 12)
    d.ellipse((7, 81, 90, 91), fill="#101e28")
    export("display-dial", dial)

    grid = Image.new("RGBA", (12, 12))
    ImageDraw.Draw(grid).point((0, 0), fill="#395160")
    export("optics-grid", grid)
    scale = Image.new("RGBA", (35, 6))
    d = ImageDraw.Draw(scale)
    for x in range(0, 35, 7):
        d.line((x, 0, x, 5 if x == 0 else 2), fill="#655b4d")
    export("optics-scale", scale)

    selection = Image.new("RGBA", (47, 47))
    d = ImageDraw.Draw(selection)
    ring(d, 23, 23, 22, "#d29855")
    for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = 23 + dx * 21, 23 + dy * 21
        d.line((x - dx * 5, y, x, y, x, y - dy * 5), fill="#fee3a7", width=2)
    export("optics-selection", selection)

    for socket in ("round", "wide", "paired"):
        for state, bronze in (("available", "#ab8152"), ("locked", "#62717a"), ("selected", "#f1b65e")):
            medallion = Image.new("RGBA", (43, 43))
            d = ImageDraw.Draw(medallion)
            if socket == "paired":
                d.regular_polygon((21, 21, 20), 4, 45, fill="#7c5439", outline=bronze, width=2)
            elif socket == "wide":
                d.regular_polygon((21, 21, 18), 6, 0, fill="#203b48", outline=bronze, width=2)
            else:
                d.ellipse((5, 5, 37, 37), fill="#273d49", outline=bronze, width=2)
            d.ellipse((10, 10, 32, 32), fill="#102637", outline="#7e7059")
            export(f"optics-{socket}-{state}", medallion)


if __name__ == "__main__":
    main()
