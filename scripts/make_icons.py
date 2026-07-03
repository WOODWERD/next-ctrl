#!/usr/bin/env python3
"""Generate PNG app icons (indigo rounded tile + white check) with no dependencies."""
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
BG = (79, 70, 229)      # indigo #4F46E5
FG = (255, 255, 255)
SS = 3                   # supersample factor for smooth edges

def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)

def render(size, rounded=True, pad=0.0):
    S = size * SS
    # check polyline in normalized [0,1] coords, mapped into a padded content box
    pts = [(0.27, 0.55), (0.43, 0.71), (0.75, 0.31)]
    stroke = 0.115
    radius = 0.225 * S            # corner radius for rounded tile
    def content(n):               # map normalized -> hi-res px with padding
        return (pad + n * (1 - 2 * pad)) * S
    P = [(content(x), content(y)) for x, y in pts]
    half = stroke * (1 - 2 * pad) * S / 2

    buf = bytearray()
    for y in range(S):
        for x in range(S):
            inside = True
            if rounded:
                # rounded-rect mask
                cx = min(max(x, radius), S - radius)
                cy = min(max(y, radius), S - radius)
                if math.hypot(x - cx, y - cy) > radius:
                    inside = False
            if not inside:
                buf += b"\x00\x00\x00\x00"
                continue
            d = min(
                dist_seg(x, y, *P[0], *P[1]),
                dist_seg(x, y, *P[1], *P[2]),
            )
            if d <= half:
                buf += bytes(FG) + b"\xff"
            else:
                buf += bytes(BG) + b"\xff"
    # box downsample SS x SS -> size
    out = bytearray()
    row = size
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    i = (((y * SS + dy) * S) + (x * SS + dx)) * 4
                    r += buf[i]; g += buf[i+1]; b += buf[i+2]; a += buf[i+3]
            n = SS * SS
            out += bytes((r // n, g // n, b // n, a // n))
    return bytes(out), size

def write_png(path, rgba, size):
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw += rgba[y * size * 4:(y + 1) * size * 4]
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", os.path.relpath(path), size)

jobs = [
    ("icon-192.png", 192, True, 0.0),
    ("icon-512.png", 512, True, 0.0),
    ("icon-maskable-512.png", 512, False, 0.16),
    ("apple-touch-icon.png", 180, False, 0.0),
]
for name, size, rounded, pad in jobs:
    rgba, s = render(size, rounded, pad)
    write_png(os.path.join(OUT, name), rgba, s)
