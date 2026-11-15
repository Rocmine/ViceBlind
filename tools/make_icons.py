"""Render the Vice Blind icons: a sunset sun cut by window-blind slats, on a midnight-plum tile.

Usage: python tools/make_icons.py
Writes src/assets/icons/icon-{16,32,48,128,512}.png, icon-off-{16,32,48,128}.png and icon.svg.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "icons"
SIZES = (16, 32, 48, 128)
S = 1024  # supersample canvas

PLUM = (27, 10, 51)
PLUM_LIFT = (74, 18, 86)   # warm glow near the horizon
STOPS_ON = [(0.0, (255, 209, 102)), (0.48, (255, 138, 91)), (1.0, (255, 62, 150))]
STOPS_OFF = [(0.0, (150, 146, 160)), (1.0, (96, 92, 110))]

# Sun geometry on the 1024 canvas (shared with the SVG).
CX, CY, R = 512, 506, 330
RADIUS_BG = 230
# Slits cut from the lower half; each one thicker than the last, like a blind opening.
SLITS = [(528, 40), (616, 56), (712, 72), (816, 40)]  # (y, height)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient_color(stops, t):
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0) if t1 > t0 else 0)
    return stops[-1][1]


def render(stops) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Tile: plum with a warm lift rising from the bottom edge.
    bg = Image.new("RGBA", (S, S), PLUM + (255,))
    for y in range(S):
        t = max(0.0, (y - S * 0.45) / (S * 0.55)) ** 2
        ImageDraw.Draw(bg).line([(0, y), (S, y)], fill=lerp(PLUM, PLUM_LIFT, t) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), RADIUS_BG, fill=255)
    img.paste(bg, (0, 0), mask)

    # Sun: vertical gradient clipped to a disc, then slit by the slats.
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = min(max((y - (CY - R)) / (2 * R), 0), 1)
        gd.line([(0, y), (S, y)], fill=gradient_color(stops, t) + (255,))
    sun = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(sun)
    sd.ellipse((CX - R, CY - R, CX + R, CY + R), fill=255)
    for y, h in SLITS:
        sd.rectangle((0, y, S, y + h), fill=0)
    img.paste(grad, (0, 0), sun)
    return img


def svg() -> str:
    slits = "\n".join(f'      <rect x="0" y="{y}" width="{S}" height="{h}" fill="#000"/>' for y, h in SLITS)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <defs>
    <linearGradient id="sun" x1="0" y1="{CY - R}" x2="0" y2="{CY + R}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffd166"/>
      <stop offset=".48" stop-color="#ff8a5b"/>
      <stop offset="1" stop-color="#ff3e96"/>
    </linearGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".45" stop-color="#1b0a33"/>
      <stop offset="1" stop-color="#4a1256"/>
    </linearGradient>
    <mask id="slats">
      <rect width="{S}" height="{S}" fill="#fff"/>
{slits}
    </mask>
  </defs>
  <rect width="{S}" height="{S}" rx="{RADIUS_BG}" fill="url(#tile)"/>
  <circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#sun)" mask="url(#slats)"/>
</svg>
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, stops in (("icon", STOPS_ON), ("icon-off", STOPS_OFF)):
        big = render(stops)
        for size in SIZES:
            big.resize((size, size), Image.LANCZOS).save(OUT / f"{name}-{size}.png", optimize=True)
    (OUT / "icon.svg").write_text(svg(), encoding="utf-8")
    render(STOPS_ON).resize((512, 512), Image.LANCZOS).save(OUT / "icon-512.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
