#!/usr/bin/env python3
# ============================================================
# PRICE SCOUT — icon generator (pure Python, no Pillow needed)
# Draws the brand mark — a radar scope on a mint gradient tile —
# at 16 / 32 / 48 / 128 px. Each size is rendered at 8x then box-
# downsampled for crisp anti-aliasing. Mirrors the sister product's
# generator; only the motif (radar) and hue (mint) differ.
#   run:  python3 make_icons.py
# ============================================================
import struct, zlib, math

# Mint gradient stops (light -> mint -> deep teal-green)
STOPS = [(0.0, (122, 240, 200)), (0.5, (47, 224, 166)), (1.0, (24, 150, 110))]


def grad(t):
    if t <= 0:
        return STOPS[0][1]
    if t >= 1:
        return STOPS[-1][1]
    for k in range(len(STOPS) - 1):
        t0, c0 = STOPS[k]
        t1, c1 = STOPS[k + 1]
        if t0 <= t <= t1:
            f = (t - t0) / (t1 - t0)
            return tuple(int(round(c0[j] + (c1[j] - c0[j]) * f)) for j in range(3))
    return STOPS[-1][1]


def render(H):
    """Render the icon into an HxH RGBA bytearray."""
    buf = bytearray(H * H * 4)  # transparent

    def put(x, y, r, g, b, a):
        x = int(x); y = int(y)
        if x < 0 or y < 0 or x >= H or y >= H:
            return
        i = (y * H + x) * 4
        da = buf[i + 3] / 255.0
        sa = a / 255.0
        outa = sa + da * (1 - sa)
        if outa <= 0:
            buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0
            return
        buf[i]     = int(round((r * sa + buf[i]     * da * (1 - sa)) / outa))
        buf[i + 1] = int(round((g * sa + buf[i + 1] * da * (1 - sa)) / outa))
        buf[i + 2] = int(round((b * sa + buf[i + 2] * da * (1 - sa)) / outa))
        buf[i + 3] = int(round(outa * 255))

    # ---- rounded-square mint gradient tile with a soft top gloss ----
    m = 0.082 * H
    r = 0.226 * H
    x0, y0, x1, y1 = m, m, H - m, H - m
    span = (x1 + y1) - (x0 + y0)
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            qx = max(x0 + r - x, x - (x1 - r), 0)
            qy = max(y0 + r - y, y - (y1 - r), 0)
            if qx * qx + qy * qy > r * r:
                continue
            c = grad((x + y - (x0 + y0)) / span)
            hi = 0.20 * (1 - (y - y0) / (y1 - y0))  # gloss toward the top
            i = (y * H + x) * 4
            buf[i]     = int(round(c[0] + (255 - c[0]) * hi))
            buf[i + 1] = int(round(c[1] + (255 - c[1]) * hi))
            buf[i + 2] = int(round(c[2] + (255 - c[2]) * hi))
            buf[i + 3] = 255

    cx = cy = H / 2.0
    INK = (8, 24, 18)      # deep ink-green for scope lines (reads on mint)
    W = (255, 255, 255)

    def ring(R, w, col, a):
        ro = (R + w / 2) ** 2
        ri = (R - w / 2) ** 2
        for y in range(int(cy - R - w), int(cy + R + w) + 1):
            for x in range(int(cx - R - w), int(cx + R + w) + 1):
                d = (x - cx) ** 2 + (y - cy) ** 2
                if ri <= d <= ro:
                    put(x, y, col[0], col[1], col[2], a)

    def disc(gx, gy, R, col, a):
        rr = R * R
        for y in range(int(gy - R), int(gy + R) + 1):
            for x in range(int(gx - R), int(gx + R) + 1):
                if (x - gx) ** 2 + (y - gy) ** 2 <= rr:
                    put(x, y, col[0], col[1], col[2], a)

    def bar(half, length, col, a, vertical=False):
        # a centered crosshair bar through (cx, cy)
        for y in range(int(cy - length), int(cy + length) + 1):
            for x in range(int(cx - length), int(cx + length) + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 > length * length:
                    continue
                if not vertical and abs(y - cy) <= half:
                    put(x, y, col[0], col[1], col[2], a)
                if vertical and abs(x - cx) <= half:
                    put(x, y, col[0], col[1], col[2], a)

    def sector(R, a0, a1, col, a):
        # filled pie slice between angles a0..a1 (radians), within radius R
        rr = R * R
        for y in range(int(cy - R), int(cy + R) + 1):
            for x in range(int(cx - R), int(cx + R) + 1):
                dx = x - cx; dy = y - cy
                if dx * dx + dy * dy > rr:
                    continue
                ang = math.atan2(dy, dx)
                if a0 <= ang <= a1:
                    put(x, y, col[0], col[1], col[2], a)

    R1 = 0.300 * H
    R2 = 0.182 * H
    # crosshair under the rings
    bar(0.012 * H, R1, INK, 150, vertical=False)
    bar(0.012 * H, R1, INK, 150, vertical=True)
    # scanning wedge (semi-transparent white), pointing up-right
    sector(R1 - 0.02 * H, math.radians(-78), math.radians(-30), W, 120)
    # concentric rings
    ring(R1, 0.030 * H, INK, 235)
    ring(R2, 0.022 * H, INK, 175)
    # center hub
    disc(cx, cy, 0.052 * H, INK, 255)
    # a bright blip on the up-right sweep edge
    ba = math.radians(-40)
    disc(cx + 0.205 * H * math.cos(ba), cy + 0.205 * H * math.sin(ba), 0.040 * H, W, 255)
    return buf


def downsample(buf, H, OUT):
    S = H // OUT
    out = bytearray(OUT * OUT * 4)
    for y in range(OUT):
        for x in range(OUT):
            sr = sg = sb = sa = 0
            for dy in range(S):
                base = ((y * S + dy) * H + x * S) * 4
                for dx in range(S):
                    i = base + dx * 4
                    a = buf[i + 3]
                    sr += buf[i] * a; sg += buf[i + 1] * a; sb += buf[i + 2] * a; sa += a
            j = (y * OUT + x) * 4
            if sa > 0:
                out[j] = sr // sa; out[j + 1] = sg // sa; out[j + 2] = sb // sa
                out[j + 3] = sa // (S * S)
    return out


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


for size in (16, 32, 48, 128):
    S = 8
    hi = render(size * S)
    small = downsample(hi, size * S, size)
    with open("icon%d.png" % size, "wb") as f:
        f.write(png(small, size, size))
    print("wrote icon%d.png" % size)
