"""앱 아이콘 생성 (Pillow 필요): build/icon.png, build/icon.ico, build/tray.png, build/tray-paused.png

목업의 귀 아이콘 SVG 경로(24×24 좌표)를 그대로 점으로 펼쳐 그린다.
  M8 17a4 4 0 0 0 8 0c0-2 3-3 3-7a7 7 0 0 0-14 0
  M12 8a2.5 2.5 0 0 1 2.5 2.5c0 1.5-2.5 2-2.5 4
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent.parent / "build"
out.mkdir(exist_ok=True)

def cubic(p0, p1, p2, p3, n=30):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(tuple(u**3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t**3 * p3[k] for k in range(2)))
    return pts

# 경로 1: (8,17)→아래 반원→(16,17) → 곡선 → (19,10) → 위쪽 큰 반원 → (5,10)
path1 = [(12 - 4 * math.cos(math.pi * i / 40), 17 + 4 * math.sin(math.pi * i / 40)) for i in range(41)]
path1 += cubic((16, 17), (16, 15), (19, 14), (19, 10))[1:]
path1 += [(12 + 7 * math.cos(-math.pi * i / 60), 10 + 7 * math.sin(-math.pi * i / 60)) for i in range(61)][1:]
# 경로 2: (12,8)→시계방향 사분원→(14.5,10.5) → 곡선 → (12,14.5)
path2 = [(12 + 2.5 * math.sin(math.pi / 2 * i / 20), 10.5 - 2.5 * math.cos(math.pi / 2 * i / 20)) for i in range(21)]
path2 += cubic((14.5, 10.5), (14.5, 12), (12, 12.5), (12, 14.5))[1:]

def grad(size, c1, c2):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)
    return img

def icon(size, paused=False):
    s = size * 4
    c1, c2 = ((140, 148, 160), (186, 192, 200)) if paused else ((86, 117, 219), (109, 180, 218))
    bg = grad(s, c1, c2)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.24), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)
    pad = s * 0.16
    k = (s - 2 * pad) / 24
    w = max(3, round(2.1 * k))
    for path in (path1, path2):
        pts = [(pad + x * k, pad + y * k) for x, y in path]
        d.line(pts, fill="white", width=w, joint="curve")
        for x, y in (pts[0], pts[-1]):
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill="white")
    return img.resize((size, size), Image.LANCZOS)

icon(256).save(out / "icon.png")
icon(256).save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon(32).save(out / "tray.png")
icon(32, paused=True).save(out / "tray-paused.png")
print("icons written to", out)
