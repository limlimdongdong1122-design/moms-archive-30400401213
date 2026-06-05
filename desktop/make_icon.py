#!/usr/bin/env python3
# Generates a crisp 512x512 app icon (brand gradient tile + vault dial),
# replacing the too-small 128x128 icon so electron-builder (needs >=256) works.
import struct, zlib

HS = 1024   # render hi-res, then 2x2 downsample for anti-aliasing
OUT = 512
buf = bytearray(HS * HS * 4)  # transparent

def put(x, y, r, g, b, a):
    if x < 0 or y < 0 or x >= HS or y >= HS:
        return
    i = (y * HS + x) * 4
    da = buf[i + 3] / 255.0
    sa = a / 255.0
    outa = sa + da * (1 - sa)
    if outa <= 0:
        buf[i] = buf[i+1] = buf[i+2] = buf[i+3] = 0
        return
    buf[i]   = int(round((r * sa + buf[i]   * da * (1 - sa)) / outa))
    buf[i+1] = int(round((g * sa + buf[i+1] * da * (1 - sa)) / outa))
    buf[i+2] = int(round((b * sa + buf[i+2] * da * (1 - sa)) / outa))
    buf[i+3] = int(round(outa * 255))

stops = [(0.0, (182, 210, 255)), (0.5, (110, 168, 255)), (1.0, (139, 123, 240))]
def grad(t):
    if t <= 0: return stops[0][1]
    if t >= 1: return stops[-1][1]
    for k in range(len(stops) - 1):
        t0, c0 = stops[k]; t1, c1 = stops[k + 1]
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0)
            return tuple(int(round(c0[j] + (c1[j] - c0[j]) * f)) for j in range(3))
    return stops[-1][1]

# --- rounded-square gradient tile with a soft top gloss ---
m = 84; x0 = m; y0 = m; x1 = HS - m; y1 = HS - m; r = 232
span = (x1 + y1) - (x0 + y0)
for y in range(y0, y1 + 1):
    row = y * HS
    for x in range(x0, x1 + 1):
        qx = max(x0 + r - x, x - (x1 - r), 0)
        qy = max(y0 + r - y, y - (y1 - r), 0)
        if qx * qx + qy * qy > r * r:
            continue
        c = grad((x + y - (x0 + y0)) / span)
        hi = 0.20 * (1 - (y - y0) / (y1 - y0))   # gloss toward the top
        i = (row + x) * 4
        buf[i]   = int(round(c[0] + (255 - c[0]) * hi))
        buf[i+1] = int(round(c[1] + (255 - c[1]) * hi))
        buf[i+2] = int(round(c[2] + (255 - c[2]) * hi))
        buf[i+3] = 255

def ring(cx, cy, R, w, col, a):
    ro = (R + w / 2) ** 2; ri = (R - w / 2) ** 2
    for y in range(int(cy - R - w), int(cy + R + w)):
        for x in range(int(cx - R - w), int(cx + R + w)):
            d = (x - cx) ** 2 + (y - cy) ** 2
            if ri <= d <= ro:
                put(x, y, col[0], col[1], col[2], a)

def disc(cx, cy, R, col, a):
    rr = R * R
    for y in range(int(cy - R), int(cy + R + 1)):
        for x in range(int(cx - R), int(cx + R + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rr:
                put(x, y, col[0], col[1], col[2], a)

cx = cy = HS // 2
W = (255, 255, 255)
# vault dial: outer ring, inner ring, hub, + six bolts around the dial
ring(cx, cy, 250, 30, W, 235)
ring(cx, cy, 156, 18, W, 150)
disc(cx, cy, 48, W, 255)
import math
for k in range(6):
    ang = math.pi / 6 + k * math.pi / 3
    disc(cx + 250 * math.cos(ang), cy + 250 * math.sin(ang), 17, W, 230)

# --- downsample 2x2 (alpha-weighted) ---
out = bytearray(OUT * OUT * 4)
for y in range(OUT):
    for x in range(OUT):
        sr = sg = sb = sa = 0
        for dy in range(2):
            base = ((y * 2 + dy) * HS + x * 2) * 4
            for dx in range(2):
                i = base + dx * 4
                a = buf[i + 3]
                sr += buf[i] * a; sg += buf[i+1] * a; sb += buf[i+2] * a; sa += a
        j = (y * OUT + x) * 4
        if sa > 0:
            out[j] = sr // sa; out[j+1] = sg // sa; out[j+2] = sb // sa; out[j+3] = sa // 4
        # else leaves transparent

def png(data, W, H):
    raw = bytearray()
    for y in range(H):
        raw.append(0)
        raw += data[y * W * 4:(y + 1) * W * 4]
    comp = zlib.compress(bytes(raw), 9)
    def chunk(typ, d):
        return struct.pack(">I", len(d)) + typ + d + struct.pack(">I", zlib.crc32(typ + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", comp) + chunk(b"IEND", b""))

with open("assets/icon.png", "wb") as f:
    f.write(png(out, OUT, OUT))
print("wrote assets/icon.png", OUT, "x", OUT)
