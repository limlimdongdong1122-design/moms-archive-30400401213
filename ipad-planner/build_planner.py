#!/usr/bin/env python3
"""
============================================================
 Dot-Grid Notebook for iPad  —  PDF builder
------------------------------------------------------------
 Generates a clean, landscape, bilingual (EN + KO) dot-grid
 notebook PDF you can import into GoodNotes / Notability and
 write on with an Apple Pencil.

   * Landscape 3:2 (24 x 16 cm) — fills the iPad screen nicely
   * 5 mm dot grid (the standard dot-journal spacing)
   * Cover + how-to page + 60 dotted pages
   * No hyperlinks (kept simple, by request)

 Build:
     python3 build_planner.py
 Output:
     dotgrid-notebook.pdf  (next to this script)

 Fonts (TrueType, bundled in ./fonts) are embedded & subset,
 so the file renders the same everywhere.
============================================================
"""
import os
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
OUT = os.path.join(HERE, "dotgrid-notebook.pdf")

# ---- page geometry --------------------------------------------------------
PAGE_W, PAGE_H = 24 * cm, 16 * cm          # 3:2 landscape
M_SIDE = 1.5 * cm                          # left / right margin
M_BOTTOM = 1.2 * cm                        # bottom margin
HEADER_Y = PAGE_H - 1.7 * cm               # header hairline
DOT_TOP = PAGE_H - 2.1 * cm                # first dot row (from top)
DOT_STEP = 5 * mm                          # 5 mm dot grid
DOT_R = 0.55                               # dot radius (pt)
PAGES = 60                                 # number of dotted pages

# ---- palette --------------------------------------------------------------
def hexc(h, a=1.0):
    h = h.lstrip("#")
    return Color(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255,
                 int(h[4:6], 16) / 255, a)

PAPER   = hexc("FCFCFB")
DOT     = hexc("C3C6CD")
INK     = hexc("2A2D34")
DIM     = hexc("8B919C")
FAINT   = hexc("B9BEC8")
ACCENT  = hexc("5B6CF0")
HAIRLN  = hexc("E4E6EB")

COVER_TOP = hexc("1B1C30")
COVER_BOT = hexc("0D0E18")
COVER_DIM = hexc("9CA2C4")
COVER_FAINT = hexc("565B82")

# ---- fonts ----------------------------------------------------------------
pdfmetrics.registerFont(TTFont("Nanum", os.path.join(FONT_DIR, "NanumGothic-Regular.ttf")))
pdfmetrics.registerFont(TTFont("NanumXB", os.path.join(FONT_DIR, "NanumGothic-ExtraBold.ttf")))
EN      = "Helvetica"
EN_B    = "Helvetica-Bold"
KO      = "Nanum"
KO_B    = "NanumXB"


def text(c, x, y, s, font, size, color, align="left", tracking=0.0):
    # width including letter-spacing, so center/right alignment stays correct
    w = pdfmetrics.stringWidth(s, font, size) + tracking * max(0, len(s) - 1)
    if align == "center":
        x -= w / 2
    elif align == "right":
        x -= w
    to = c.beginText(x, y)
    to.setFont(font, size)
    to.setFillColor(color)
    if tracking:
        to.setCharSpace(tracking)
    to.textOut(s)
    c.drawText(to)


# ---------------------------------------------------------------------------
# Re-usable page "chrome" (everything identical on every dotted page) is drawn
# into a Form XObject once, then stamped on each page — keeps the file small.
# ---------------------------------------------------------------------------
def define_chrome(c):
    c.beginForm("chrome")
    # paper
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # header hairline
    c.setStrokeColor(HAIRLN)
    c.setLineWidth(0.8)
    c.line(M_SIDE + 0.5 * cm, HEADER_Y, PAGE_W - M_SIDE, HEADER_Y)

    # accent square mark (top-left)
    c.setFillColor(ACCENT)
    c.roundRect(M_SIDE, HEADER_Y - 0.05 * cm, 0.28 * cm, 0.28 * cm, 1.2, stroke=0, fill=1)

    # date field (top-right, above the rule)
    text(c, PAGE_W - M_SIDE, HEADER_Y + 0.18 * cm, "DATE", EN, 7, FAINT, "right", 1.2)
    text(c, PAGE_W - M_SIDE - 1.55 * cm, HEADER_Y + 0.18 * cm, "날짜", KO, 7, FAINT, "right")

    # the dot grid
    c.setFillColor(DOT)
    y = DOT_TOP
    while y >= M_BOTTOM - 0.01:
        x = M_SIDE
        while x <= PAGE_W - M_SIDE + 0.01:
            c.circle(x, y, DOT_R, stroke=0, fill=1)
            x += DOT_STEP
        y -= DOT_STEP

    c.endForm()


def dotted_page(c, n):
    c.doForm("chrome")
    # page number (the only per-page element)
    text(c, PAGE_W / 2, 0.62 * cm, f"{n:02d}", EN, 7.5, FAINT, "center", 2.0)
    c.setFillColor(ACCENT)
    c.circle(PAGE_W / 2 - 0.7 * cm, 0.62 * cm + 0.07 * cm, 0.6, stroke=0, fill=1)
    c.showPage()


def cover_page(c):
    # gradient background
    c.linearGradient(0, PAGE_H, 0, 0, (COVER_TOP, COVER_BOT), (0, 1), extend=True)

    # decorative dot matrix (top-right)
    c.setFillColor(COVER_FAINT)
    for r in range(7):
        for col in range(11):
            c.circle(PAGE_W - 4.6 * cm + col * 0.42 * cm,
                     PAGE_H - 1.7 * cm - r * 0.42 * cm, 0.7, stroke=0, fill=1)

    # accent tab
    c.setFillColor(ACCENT)
    c.roundRect(M_SIDE + 0.4 * cm, PAGE_H / 2 + 2.55 * cm, 0.85 * cm, 0.28 * cm, 1.2, stroke=0, fill=1)

    cx = M_SIDE + 0.4 * cm
    # title
    text(c, cx, PAGE_H / 2 + 0.9 * cm, "DOT GRID", EN_B, 62, hexc("FFFFFF"), "left", 1.0)
    text(c, cx + 0.12 * cm, PAGE_H / 2 - 0.7 * cm, "NOTEBOOK", EN, 22, ACCENT, "left", 7.0)
    # korean
    text(c, cx + 0.12 * cm, PAGE_H / 2 - 2.0 * cm, "도트그리드 노트북", KO_B, 17, COVER_DIM, "left")

    # divider
    c.setStrokeColor(COVER_FAINT)
    c.setLineWidth(1)
    c.line(cx + 0.12 * cm, PAGE_H / 2 - 2.9 * cm, cx + 7.5 * cm, PAGE_H / 2 - 2.9 * cm)

    # tagline
    text(c, cx + 0.12 * cm, PAGE_H / 2 - 3.7 * cm,
         "Made for iPad  ·  GoodNotes  ·  Notability", EN, 10.5, COVER_DIM)
    text(c, cx + 0.12 * cm, PAGE_H / 2 - 4.35 * cm,
         "아이패드 필기용  ·  굿노트  ·  노타빌리티", KO, 10, COVER_FAINT)

    # footer
    text(c, cx + 0.12 * cm, 1.1 * cm, "5 mm dot grid · 60 pages", EN, 9, COVER_FAINT, "left", 0.5)
    text(c, PAGE_W - M_SIDE, 1.1 * cm, "2026", EN, 9, COVER_FAINT, "right", 2.0)
    c.showPage()


def howto_page(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    x = M_SIDE + 0.4 * cm
    top = PAGE_H - 2.4 * cm
    c.setFillColor(ACCENT)
    c.roundRect(x, top + 0.95 * cm, 0.75 * cm, 0.26 * cm, 1.2, stroke=0, fill=1)
    text(c, x, top, "How to use", EN_B, 26, INK, "left")
    text(c, x + 0.05 * cm, top - 0.95 * cm, "사용법", KO_B, 13, DIM, "left")

    c.setStrokeColor(HAIRLN)
    c.setLineWidth(0.8)
    c.line(x, top - 1.5 * cm, PAGE_W - M_SIDE, top - 1.5 * cm)

    items = [
        ("Import this PDF into GoodNotes or Notability.",
         "이 PDF를 굿노트나 노타빌리티로 가져오세요."),
        ("Write anywhere on the dot grid with your Apple Pencil.",
         "애플펜슬로 도트그리드 위에 자유롭게 필기하세요."),
        ("Dots are 5 mm apart — great for sketches, diagrams & bullet journaling.",
         "점 간격은 5mm — 스케치 · 다이어그램 · 불릿저널에 좋아요."),
        ("60 dotted pages. Need more? Just duplicate a page inside the app.",
         "점선 60페이지. 더 필요하면 앱에서 페이지를 복제하세요."),
    ]
    y = top - 2.7 * cm
    for i, (en, ko) in enumerate(items, 1):
        c.setFillColor(ACCENT)
        c.circle(x + 0.2 * cm, y + 0.12 * cm, 0.45 * cm * 0.0 + 9, stroke=0, fill=1) if False else None
        # numbered chip
        c.setFillColor(ACCENT)
        c.circle(x + 0.25 * cm, y + 0.1 * cm, 0.32 * cm, stroke=0, fill=1)
        text(c, x + 0.25 * cm, y - 0.02 * cm, str(i), EN_B, 10, hexc("FFFFFF"), "center")
        text(c, x + 0.95 * cm, y + 0.12 * cm, en, EN, 12.5, INK, "left")
        text(c, x + 0.95 * cm, y - 0.55 * cm, ko, KO, 10.5, DIM, "left")
        y -= 1.95 * cm

    # mini dot sample, bottom-right
    c.setFillColor(DOT)
    bx, by = PAGE_W - 5.6 * cm, 1.6 * cm
    for r in range(5):
        for col in range(11):
            c.circle(bx + col * DOT_STEP, by + r * DOT_STEP, DOT_R, stroke=0, fill=1)
    text(c, bx, by - 0.6 * cm, "5 mm grid · 5mm 격자", KO, 7.5, FAINT, "left")
    c.showPage()


def main():
    c = canvas.Canvas(OUT, pagesize=(PAGE_W, PAGE_H))
    c.setTitle("Dot-Grid Notebook (iPad)")
    c.setAuthor("Dot-Grid Notebook")
    c.setSubject("Landscape 5mm dot grid notebook for GoodNotes / Notability")

    define_chrome(c)          # define the reusable form first
    cover_page(c)
    howto_page(c)
    for n in range(1, PAGES + 1):
        dotted_page(c, n)
    c.save()
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
