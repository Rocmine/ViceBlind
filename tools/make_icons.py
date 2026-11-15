"""Render the Vice Blind icons: a navy rounded square with three gradient "blind slats".

Usage: python tools/make_icons.py
Writes src/assets/icons/icon-{16,32,48,128}.png, icon-off-{16,32,48,128}.png and icon.svg.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "icons"
SIZES = (16, 32, 48, 128)
S = 1024  # supersample canvas

NAVY = (6, 6, 15)
NAVY_LIFT = (16, 14, 32)
STOPS_ON = [(0.0, (59, 109, 255)), (0.5, (138, 77, 255)), (1.0, (238, 22, 129))]
STOPS_OFF = [(0.0, (120, 120, 132)), (1.0, (84, 84, 96))]

# Geometry on a 1024 canvas (shared with the SVG below).
PAD = 150            # inner margin left/right
SLAT_H = 168
GAP = 62
RADIUS_BG = 230
RADIUS_SLAT = 40
SLAT_RIGHT = S - PAD - 120   # slats stop short of the cord
CORD_X = S - PAD - 34
CORD_W = 26
CORD_DROP = 70
BEAD_R = 44


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient_color(stops, t):
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0) if t1 > t0 else 0)
    return stops[-1][1]


def slat_rows():
    total = 3 * SLAT_H + 2 * GAP
    top = (S - total) // 2 - 48  # lifted so slats + cord bead sit centred
    return [(top + i * (SLAT_H + GAP), top + i * (SLAT_H + GAP) + SLAT_H) for i in range(3)]


def render(stops) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Background: rounded navy square with a soft radial lift near the top.
    bg = Image.new("RGBA", (S, S), NAVY + (255,))
    lift = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(lift)
    for r in range(S // 2, 0, -8):
        a = int(150 * (1 - r / (S / 2)) ** 1.6)
        ld.ellipse((S / 2 - r * 1.3, S * 0.3 - r, S / 2 + r * 1.3, S * 0.3 + r), fill=a)
    bg.paste(Image.new("RGBA", (S, S), NAVY_LIFT + (255,)), (0, 0), lift)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), RADIUS_BG, fill=255)
    img.paste(bg, (0, 0), mask)

    # Horizontal gradient strip, cut out by the three slat shapes.
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    for x in range(S):
        t = min(max((x - PAD) / (S - 2 * PAD), 0), 1)
        gd.line([(x, 0), (x, S)], fill=gradient_color(stops, t) + (255,))
    slats = Image.new("L", (S, S), 0)
    sd = ImageDraw.Draw(slats)
    rows = slat_rows()
    for y0, y1 in rows:
        sd.rounded_rectangle((PAD, y0, SLAT_RIGHT, y1), RADIUS_SLAT, fill=255)
    # Pull cord on the right: what makes three bars read as a window blind.
    sd.rounded_rectangle((CORD_X - CORD_W // 2, rows[0][0] + 20, CORD_X + CORD_W // 2, rows[-1][1] + CORD_DROP), CORD_W // 2, fill=255)
    cy = rows[-1][1] + CORD_DROP
    sd.ellipse((CORD_X - BEAD_R, cy - BEAD_R, CORD_X + BEAD_R, cy + BEAD_R), fill=255)
    img.paste(grad, (0, 0), slats)
    return img


def svg() -> str:
    rows = slat_rows()
    rects = "\n".join(
        f'  <rect x="{PAD}" y="{y0}" width="{SLAT_RIGHT - PAD}" height="{SLAT_H}" rx="{RADIUS_SLAT}" fill="url(#g)"/>'
        for y0, _ in rows
    )
    cy = rows[-1][1] + CORD_DROP
    rects += (f'\n  <rect x="{CORD_X - CORD_W // 2}" y="{rows[0][0] + 20}" width="{CORD_W}" '
              f'height="{cy - rows[0][0] - 20}" rx="{CORD_W // 2}" fill="url(#g)"/>'
              f'\n  <circle cx="{CORD_X}" cy="{cy}" r="{BEAD_R}" fill="url(#g)"/>')
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <defs>
    <linearGradient id="g" x1="{PAD}" y1="0" x2="{S - PAD}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3b6dff"/>
      <stop offset=".5" stop-color="#8a4dff"/>
      <stop offset="1" stop-color="#ee1681"/>
    </linearGradient>
    <radialGradient id="r" cx=".5" cy=".3" r=".65">
      <stop offset="0" stop-color="#100e20"/>
      <stop offset="1" stop-color="#06060f"/>
    </radialGradient>
  </defs>
  <rect width="{S}" height="{S}" rx="{RADIUS_BG}" fill="url(#r)"/>
{rects}
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
