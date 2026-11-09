"""Zoomed crop of the three-view with a labelled pixel grid (original coordinates)."""
import sys
from PIL import Image, ImageDraw
x0, y0, x1, y1, z = map(int, sys.argv[1:6]); out = sys.argv[6]; step = int(sys.argv[7]) if len(sys.argv) > 7 else 10
im = Image.open('ref/three-view.jpg').convert('RGB').crop((x0, y0, x1, y1))
im = im.resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
d = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    X = (x - x0) * z; d.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if x % (step*5) == 0 else (255, 170, 170)); 
    if x % (step*5) == 0: d.text((X + 2, 2), str(x), fill=(200, 0, 0))
for y in range((y0 // step + 1) * step, y1, step):
    Y = (y - y0) * z; d.line([(0, Y), (im.width, Y)], fill=(0, 0, 255) if y % (step*5) == 0 else (170, 170, 255))
    if y % (step*5) == 0: d.text((2, Y + 2), str(y), fill=(0, 0, 200))
im.save(out)
