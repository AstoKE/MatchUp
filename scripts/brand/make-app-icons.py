#!/usr/bin/env python3
"""Regenerates the app and web icons from the master logo (apps/app/assets/brand/logo-v2-1254.png).

One-off tool, not part of the build (needs Pillow: `python3 -m pip install pillow`). Run from the repo root:
    python3 scripts/brand/make-app-icons.py

Why a light tile: the logo's navy shapes disappear on a dark ground, so the opaque icons sit on the light
ground of docs/design.md (#F4F6F8). iOS icons must be opaque; Android gets a background layer, a foreground
layer inside the safe zone and a one-color silhouette for themed icons. The favicon is a rounded tile so it
reads in both light and dark browser tabs.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "apps/app/assets"
MASTER = ASSETS / "brand/logo-v2-1254.png"
GROUND = (244, 246, 248, 255)  # #F4F6F8, design.md light ground


def logo_cropped() -> Image.Image:
    im = Image.open(MASTER).convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(bbox)


def place(logo: Image.Image, size: int, fraction: float) -> Image.Image:
    """The logo scaled so its longer side is `fraction` of the canvas, centered on a transparent canvas."""
    scale = size * fraction / max(logo.size)
    scaled = logo.resize((round(logo.width * scale), round(logo.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


def silhouette(layer: Image.Image) -> Image.Image:
    """Black where the logo is, transparent elsewhere (Android themed icons tint it)."""
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.putalpha(layer.getchannel("A"))
    return out


def main() -> None:
    logo = logo_cropped()

    # iOS and the store: opaque, 1024, the logo inside the area the OS mask keeps.
    icon = Image.new("RGBA", (1024, 1024), GROUND)
    icon.alpha_composite(place(logo, 1024, 0.72))
    icon.convert("RGB").save(ASSETS / "icon.png", optimize=True)

    # Android adaptive icon: 1024 layers; the visible area is the inner 66 %, so the logo stays inside it.
    foreground = place(logo, 1024, 0.52)
    foreground.save(ASSETS / "android-icon-foreground.png", optimize=True)
    Image.new("RGBA", (1024, 1024), GROUND).save(ASSETS / "android-icon-background.png", optimize=True)
    silhouette(foreground).save(ASSETS / "android-icon-monochrome.png", optimize=True)

    # Splash: the logo alone on transparency (the splash background color comes from the app config).
    place(logo, 1024, 0.62).save(ASSETS / "splash-icon.png", optimize=True)

    # Web favicon: a rounded light tile, 96 px (browsers scale it down), readable in light and dark tabs.
    size = 96
    tile = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=size * 4 // 5, fill=GROUND)
    tile.alpha_composite(place(logo, size * 4, 0.80))
    tile.resize((size, size), Image.LANCZOS).save(ASSETS / "favicon.png", optimize=True)

    print("icon, android layers, splash and favicon written to", ASSETS)


if __name__ == "__main__":
    main()
