# Local fonts (optional — graceful fallback)

PRICE SCOUT's design uses **Space Grotesk** (display) and **Inter** (body).
Manifest V3's Content Security Policy blocks loading fonts from a CDN, so the
fonts must be **bundled locally** as files in this folder.

**You don't have to do anything** — if these files are missing, the UI falls
back cleanly to the system font stack and still looks good. Drop the files in
for the intended premium typography.

## One-time setup

Download these six `.woff2` files (latin subset is fine) and place them here
with **exactly these names**:

| File name                 | Font / weight            |
| ------------------------- | ------------------------ |
| `space-grotesk-500.woff2` | Space Grotesk · Medium   |
| `space-grotesk-600.woff2` | Space Grotesk · SemiBold |
| `space-grotesk-700.woff2` | Space Grotesk · Bold     |
| `inter-400.woff2`         | Inter · Regular          |
| `inter-500.woff2`         | Inter · Medium           |
| `inter-600.woff2`         | Inter · SemiBold         |

Easy sources (pick one):

- **Fontsource (direct files):**
  - `https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2`
    (swap `500` for `600` / `700`)
  - `https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff2`
    (swap `400` for `500` / `600`)
- **Google Fonts:** download the families, convert the needed weights to
  `.woff2`, and rename to match the table above.

Then reload the extension at `chrome://extensions`. That's it — `tokens.css`
already references these files via `@font-face`, and `local()` first so an
installed system copy is used before the bundled file.
