# 📓 Dot-Grid Notebook for iPad (GoodNotes / Notability)

A clean, landscape, **bilingual (EN + KO)** dot-grid notebook PDF you can
import into **GoodNotes** or **Notability** and write on with the Apple Pencil.

**Deliverable:** [`dotgrid-notebook.pdf`](dotgrid-notebook.pdf)

## What's inside
- **Landscape 3:2 (24 × 16 cm)** — fills the iPad screen nicely.
- **5 mm dot grid** — the standard dot-journal spacing (sketches, diagrams, bullet journaling).
- **Cover + How-to page + 60 dotted pages.**
- Each page has a tiny header (accent mark + `DATE 날짜` field) and a footer page number.
- **No hyperlinks** — kept simple, as requested.
- Fonts are **embedded & subset** (NanumGothic), so it renders identically everywhere.

## How to use it
1. Send `dotgrid-notebook.pdf` to your iPad (AirDrop, email, or Files/iCloud).
2. **GoodNotes:** `+` → *Import* → pick the PDF → it opens as a writable notebook.
   **Notability:** `Import` (or share-sheet → *Open in Notability*).
3. Write anywhere with the Apple Pencil. Need more pages? Duplicate a page inside the app.

## Rebuild it yourself
```bash
pip install reportlab
python3 build_planner.py      # → dotgrid-notebook.pdf
```

### Tweak it
Open `build_planner.py` and change the constants near the top:
- `PAGE_W, PAGE_H` — page size / aspect ratio
- `DOT_STEP` — dot spacing (default 5 mm)
- `PAGES` — number of dotted pages (default 60)
- the palette (`ACCENT`, `DOT`, …)

Fonts live in `./fonts` (NanumGothic, OFL licensed).
