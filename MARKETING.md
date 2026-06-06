# IMPULSE VAULT — Marketing kit

Launch copy for the extension + landing site (impursivevault.com).
English-first; Korean lines included where useful.

---

## 1) 15-second demo video script (voiceover + captions)

Pace: quick and light. Keep VO short; captions carry the message. Music: calm → rising.

| Time | Shot | VO (EN) | VO (KO) | Caption EN / KO |
| --- | --- | --- | --- | --- |
| 0–2s | A $199 product page; cursor moves toward **"Buy now"** | "It's not about willpower." | "의지의 문제가 아니에요." | **It's not willpower.** / 의지가 아니에요 |
| 2–4s | The instant before the click (slight slow-mo) | "It's the *speed* of the moment." | "그 순간이 너무 빠를 뿐이죠." | **It's the speed of the moment.** / 문제는 '그 순간의 속도' |
| 4–8s | IMPULSE VAULT glass modal slides in (pros/cons + "≈ 3.2 hrs of work") | "So IMPULSE VAULT adds one." | "그래서 IMPULSE VAULT가 한 박자 만들어줘요." | **A calm second thought.** / 잠깐 멈춰 생각할 틈 |
| 8–11s | Pros/cons 50:50, alternative-search results appear | "Pros, cons, and cheaper alternatives." | "장점·단점, 더 싼 대안까지." | **Pros · Cons · Alternatives.** / 장점·단점·대안 |
| 11–13s | Click **"Vault it · 24h"** → Total Saved counts up $0→$199 | "Buy it anyway — or let it cool." | "그래도 사거나, 식히거나." | **+$199 saved** / +$199 절약 |
| 13–15s | Logo + tagline + "Free · 100% local" badge | "Impulse Vault. Free, and 100% local." | "임펄스 볼트. 무료, 100% 로컬." | **Before you buy, just one more moment.** / 사기 전에, 딱 한 번만 더 |

Tips: shoot 9:16 (TikTok/Reels/Shorts) + 16:9 (PH/YouTube). First 2s must hook ("It's not willpower." full-screen). Screen-record the real extension. Captions are mandatory (most viewers watch muted). The +$199 count-up is the payoff beat.

---

## 2) Reddit & Hacker News launch posts

### r/SideProject
**Title:** I built a browser extension that pauses you the moment you hit "Buy" — pros, cons & alternatives, 100% local

I kept buying stuff I didn't need — not because I have no willpower, but because the gap between "ooh" and "purchased" is *seconds*. By the time I thought about it, it had already shipped.

So I built **IMPULSE VAULT**. The instant you click a buy/checkout button, it quietly steps in and shows:
- **Do you really need this?** — pros & cons weighed 50:50 (no fake hype)
- **The real cost** — reframed as hours of work / things you value
- **Cheaper or better alternatives** (optional AI web search)

It never blocks you — "Buy it anyway" is always one click. You can also drop it in a **Vault** to cool off for 24h, and watch your "Total Saved" grow.

**100% local** — no account, no sign-up, nothing about you leaves the browser. Free; a Pro tier ($2.99/mo) adds key-free AI analysis. Works on Chrome/Edge/Brave, bilingual (EN/KO).

Solo-built. Brutally honest feedback welcome on one thing: does the intervention feel *helpful* or *annoying*? That balance is the whole product.

Site + install: [your link]

### Show HN
**Title:** Show HN: A local-only browser extension that adds friction before you buy

I made IMPULSE VAULT, a Manifest V3 extension that intercepts buy/checkout clicks and shows a calm, evidence-based scorecard (pros/cons, opportunity cost, alternatives) before the purchase goes through. It never blocks — it just adds a deliberate pause.

Tech notes:
- **100% local by default.** Detection, the rules-based scorecard, history, and stats run in the browser; nothing about the user is sent anywhere. The only network calls are optional AI analysis (opt-in, straight to the provider you pick).
- Buy-button detection: capture-phase listener + per-site adapters + schema.org/JSON-LD fallback, with a keyword classifier that ignores login/search/download false positives.
- The intervention UI lives in a Shadow DOM so the host page can't style or break it.
- Per-product "buy it anyway" suppression so it never nags twice about the same item.
- Free; Pro ($2.99/mo via ExtensionPay/Stripe) adds managed key-free AI + web search. BYOK is free.

Bilingual (EN/KO). Feedback welcome on the detection heuristics and whether the friction feels right.

[your link]

> Note: Reddit/HN bury anything salesy. Keep the honest + technical/privacy tone, answer comments fast, one link at the bottom only.

---

## 3) Product Hunt thumbnail & gallery copy

### Thumbnail (square logo card)
- Dark bg + mint/blue glass + softly glowing vault/shield mark
- Big: **IMPULSE VAULT**
- Small (below): **Pause before you buy**
- Corner badge: `100% local` or `Free`

### Gallery (6 slides — headline + sub + what it shows)
1. **Before you buy, just one more moment.** — An extension that pauses impulse buys at the exact moment of checkout. *(hero)*
2. **It steps in right at "Buy."** — Pros, cons & the real cost, weighed 50:50, never blocking you. *(intervention modal)*
3. **Find a cheaper or better option.** — Optional AI searches the web for real alternatives, with sources. *(alternatives card)*
4. **Not sure? Vault it for 24h.** — Cool off. If you still want it tomorrow, buy it then. *(Vault + cooldown timer)*
5. **Watch your savings grow.** — Total Saved, plus a local impulse profile (when/where you're weak). *(dashboard stats + heatmap)*
6. **100% local. Zero data sent.** — No account. Free; Pro adds key-free AI. Chrome · Edge · Brave. *(privacy section + browser logos)*

Tone: dark glass + mint/blue accent (same as the site). Small IMPULSE VAULT logo pinned top-left on every slide.

---

## Reusable assets
- **Name:** IMPULSE VAULT
- **Tagline (≤60):** A calm second thought, right before you check out
- **One-liner:** The moment you hit "buy," IMPULSE VAULT lays out the pros, cons, and cheaper alternatives — then lets you decide. 100% local. Free.
- **Topics/tags:** Productivity · Chrome Extensions · Personal Finance · Privacy · Fintech
- **Pricing:** Free · Pro $2.99/mo or $24.99/yr (7-day trial)
