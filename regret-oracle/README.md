# 🔮 Regret Oracle — Telegram bot

Tell it what you're about to buy; it replies with a **regret probability %**,
a witty verdict, and the **cost in hours of your life** — then banks your
savings when you skip. Zero dependencies (Python standard library only),
zero API cost (rules-based).

## Files
- **`regret_core.py`** — the brain. Pure function, no deps, no network.
  `oracle(text, wage=15)` → returns a dict with a ready-to-send `reply`.
- **`bot.py`** — full standalone Telegram bot (long-polling, stdlib `urllib`).
- **`regret_data.json`** — auto-created per-user store (saved totals, wage).

## Run it standalone (test outside OpenClaw)
1. Create a bot with **@BotFather** in Telegram → copy the token.
2. ```bash
   BOT_TOKEN="123456:ABC..." python3 bot.py
   ```
3. DM your bot:  `wireless headphones $199 on sale`

## Use inside OpenClaw (Telegram automation)
OpenClaw already delivers the incoming Telegram message to your flow, so you
usually only need the **core function** — no polling code required:

```python
from regret_core import oracle

# `message_text` = the user's incoming Telegram text from OpenClaw
result = oracle(message_text, wage=15)   # wage optional
reply  = result["reply"]                  # send this back via OpenClaw's Telegram action
# result also has: percent, price, hours, tier
```

If OpenClaw expects a single script/handler, paste `regret_core.py`'s contents
in and call `oracle(...)` from your message handler. The two inline buttons
(🧊 Skip / 💸 Bought) in `bot.py` are optional — if OpenClaw can't render inline
keyboards, just send `result["reply"]` as plain text.

## Notes
- Price + `wage` should be the **same currency** (both USD, or both KRW).
- It's a fun heuristic, not financial advice 🙂
- Want an AI-written roast line instead of the preset pool? Add an API key and
  swap the `VERDICTS` pick for one model call — the rest stays the same.
