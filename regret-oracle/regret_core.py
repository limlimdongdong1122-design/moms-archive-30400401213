"""
============================================================
 Regret Oracle — core logic (pure, no dependencies)
------------------------------------------------------------
 The brain of the bot. Given a message like "wireless
 headphones $199 on sale" it returns a regret probability,
 a witty verdict, and the cost in hours of your life.

 This file has ZERO dependencies and ZERO network calls, so
 you can drop it straight into OpenClaw: just call
     oracle(text, wage=15)
 and reply with result["reply"].
============================================================
"""
import re
import random

# Words that scream "impulse" (English + Korean)
IMPULSE_KW = [
    "sale", "discount", "deal", "limited", "only today", "last chance",
    "now", "hurry", "tonight", "3am", "another", "one more", "treat myself",
    "treat", "flash", "drop", "must have", "need it now",
    "할인", "세일", "한정", "마지막", "지금", "오늘만", "또", "하나 더",
    "지름", "플렉스", "득템", "품절",
]
# Words that signal real utility (lower regret)
UTILITY_KW = [
    "need", "work", "broken", "replace", "required", "for school",
    "필요", "고장", "업무", "대체", "수업", "회사",
]


def parse_price(text):
    """Pull a price out of free text. Returns float or None."""
    t = text.replace(",", "")
    m = re.search(r"\$\s*(\d+(?:\.\d+)?)", t)            # $199 / $ 199.99
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:usd|dollars?)", t, re.I)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:won|원|krw)", t, re.I)  # 12000원
    if m:
        return float(m.group(1))
    m = re.search(r"\b(\d{4,8})\b", t)                   # bare 4+ digit number
    if m:
        return float(m.group(1))
    return None


def regret_score(text, price=None):
    """0–100 regret probability from simple, explainable rules."""
    t = text.lower()
    score = 35
    if price is not None:
        for thr, add in [(10, 0), (30, 8), (80, 16), (200, 26), (10 ** 9, 34)]:
            if price <= thr:
                score += add
                break
    imp = sum(1 for k in IMPULSE_KW if k in t)
    score += min(28, imp * 7)
    util = sum(1 for k in UTILITY_KW if k in t)
    score -= min(20, util * 10)
    return int(max(5, min(97, round(score))))


VERDICTS = {
    "red": [
        "Future you is already cringing.",
        "This is a 'why did I buy this' in the making.",
        "Cart it, regret it, donate it. Skip step one.",
        "The dopamine lasts 10 minutes. The charge lasts a month.",
    ],
    "orange": [
        "Sleep on it. If you still want it tomorrow, fine.",
        "Risky. Your past purchases are watching.",
        "70% of buys like this end up unused. Roll the dice?",
    ],
    "yellow": [
        "Coin-flip. Give it 24 hours.",
        "Could go either way — let it cool off.",
        "Not obviously dumb. Not obviously smart. Wait.",
    ],
    "green": [
        "Honestly? This one might be okay.",
        "Low regret risk — but you already knew that.",
        "Green light-ish. Buy on purpose, not on impulse.",
    ],
}
TIER = [(80, "red", "🔴"), (60, "orange", "🟠"), (40, "yellow", "🟡"), (0, "green", "🟢")]


def _bar(pct):
    filled = round(pct / 10)
    return "█" * filled + "░" * (10 - filled)


def oracle(text, wage=None, seed=None):
    """Main entry. Returns a dict incl. a ready-to-send `reply` string."""
    item = (text or "").strip()
    price = parse_price(item)
    pct = regret_score(item, price)
    tier = next(name for thr, name, _ in TIER if pct >= thr)
    emoji = next(e for thr, _, e in TIER if pct >= thr)
    rng = random.Random(seed) if seed is not None else random
    line = rng.choice(VERDICTS[tier])

    hours = None
    if price and wage and wage > 0:
        hours = price / wage

    show = item if len(item) <= 80 else item[:77] + "…"
    parts = [
        "🔮 *Regret Oracle*",
        "",
        f"“{show}”",
        f"Regret probability: *{pct}%*  `{_bar(pct)}`",
        f"{emoji} {line}",
    ]
    if hours:
        parts.append(f"⏳ That’s ≈ *{hours:.1f} hours* of your life.")
    elif price:
        parts.append("⏳ Set /wage <hourly pay> to see it in hours of your life.")
    parts.append("")
    parts.append("Skip it and I’ll bank the savings. 👇")

    return {
        "item": item,
        "price": price,
        "percent": pct,
        "tier": tier,
        "hours": hours,
        "reply": "\n".join(parts),
    }


if __name__ == "__main__":
    # quick manual check
    for s in [
        "wireless headphones $199 on sale limited time",
        "new keyboard 159000원 또 하나 더",
        "umbrella, mine broke, need it for work $12",
        "그냥 5만원짜리 후드티 지름",
    ]:
        r = oracle(s, wage=15, seed=1)
        print(f"\n>>> {s}\n{r['reply']}")
