"""Rasterize the three intersecting meridians of the product mark for Windows Explorer."""
from math import sin, cos, pi, radians
from pathlib import Path
from PIL import Image, ImageDraw

size = 512
tile = Image.new("RGBA", (size, size))
d = ImageDraw.Draw(tile)
d.rounded_rectangle((20, 20, 492, 492), radius=112, fill="#164348")
d.rounded_rectangle((27, 27, 485, 485), radius=106, outline="#32605f", width=4)
theta = radians(-41)
for a, b, color, width in [
    (168, 83, "#faf2dc", 15),
    (106, 130, "#faf2dc", 13),
    (29, 158, "#f39b71", 15),
]:
    points = []
    for i in range(361):
        t = pi * i / 180
        x, y = a * cos(t), b * sin(t)
        points.append((256 + x*cos(theta) - y*sin(theta), 255 + x*sin(theta) + y*cos(theta)))
    d.line(points, fill=color, width=width, joint="curve")
out = Path(__file__).resolve().parent.parent / "dist" / "desktop"
out.mkdir(parents=True, exist_ok=True)
tile.save(out / "Meridian.ico", sizes=[(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 128, 256)])

