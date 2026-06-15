"""
============================================================
 Regret Oracle — standalone Telegram bot (stdlib only)
------------------------------------------------------------
 Run it anywhere:  BOT_TOKEN="123:abc" python3 bot.py
 No pip installs — uses only Python's standard library
 (urllib) for long-polling the Telegram Bot API.

 Commands:
   /start, /help          intro
   /wage 15               set your hourly pay (for the "hours of your life")
   /stats                 your resisted count + total saved
 Any other message        → the Oracle judges it, with
                            [🧊 Skip it] / [💸 Bought it] buttons.

 Data: per-user JSON in regret_data.json next to this file.
 To use inside OpenClaw instead, you usually only need
 regret_core.oracle(text, wage) — see README.
============================================================
"""
import os
import re
import json
import time
import urllib.request
import urllib.parse

from regret_core import oracle

TOKEN = os.environ.get("BOT_TOKEN", "").strip()
API = f"https://api.telegram.org/bot{TOKEN}"
DATA_FILE = os.path.join(os.path.dirname(__file__), "regret_data.json")


# ---------- tiny JSON store ----------
def load():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save(d):
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)


def user(d, cid):
    return d.setdefault(str(cid), {"wage": 0, "saved": 0.0, "resisted": 0, "bought": 0})


# ---------- Telegram API helpers ----------
def api(method, **params):
    data = urllib.parse.urlencode(
        {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in params.items()}
    ).encode()
    try:
        with urllib.request.urlopen(API + "/" + method, data=data, timeout=70) as r:
            return json.load(r)
    except Exception as e:
        print("api error:", method, e)
        return {}


def send(cid, text, buttons=None):
    kw = {"chat_id": cid, "text": text, "parse_mode": "Markdown",
          "disable_web_page_preview": True}
    if buttons:
        kw["reply_markup"] = {"inline_keyboard": buttons}
    return api("sendMessage", **kw)


HELP = (
    "🔮 *Regret Oracle*\n\n"
    "Tell me what you're about to buy (and the price), and I'll give you "
    "the *regret probability* before you click.\n\n"
    "Try: `wireless headphones $199 on sale`\n\n"
    "*Commands*\n"
    "/wage 15 — set hourly pay (shows cost in hours of your life)\n"
    "/stats — your resisted count + total saved"
)


def handle_message(d, msg):
    cid = msg["chat"]["id"]
    text = (msg.get("text") or "").strip()
    u = user(d, cid)

    if text in ("/start", "/help") or text.startswith("/start") or text.startswith("/help"):
        send(cid, HELP)
        return
    if text.startswith("/wage"):
        m = re.search(r"(\d+(?:\.\d+)?)", text)
        if m:
            u["wage"] = float(m.group(1))
            send(cid, f"✅ Hourly pay set to *{u['wage']:g}*. Now I can show time-cost.")
        else:
            send(cid, "Usage: `/wage 15`  (your pay per hour)")
        return
    if text.startswith("/stats"):
        send(cid, (f"📊 *Your Oracle stats*\n\n"
                   f"🧊 Resisted: *{u['resisted']}*\n"
                   f"💙 Total saved: *{u['saved']:.0f}*\n"
                   f"💸 Bought anyway: {u['bought']} (no shame)"))
        return
    if not text:
        send(cid, "Send me the thing you want to buy (with a price) and I'll judge it 🔮")
        return

    # The Oracle speaks.
    r = oracle(text, wage=u.get("wage") or None)
    price = r["price"] or 0
    buttons = [[
        {"text": "🧊 Skip it", "callback_data": f"skip|{price:.2f}"},
        {"text": "💸 Bought it", "callback_data": "buy"},
    ]]
    send(cid, r["reply"], buttons)


def handle_callback(d, cq):
    cid = cq["message"]["chat"]["id"]
    data = cq.get("data", "")
    u = user(d, cid)
    if data.startswith("skip"):
        price = 0.0
        try:
            price = float(data.split("|", 1)[1])
        except Exception:
            pass
        u["resisted"] += 1
        u["saved"] += price
        msg = "🧊 Vaulted. " + (f"Saved *{price:.0f}*. " if price else "")
        msg += f"Total saved: *{u['saved']:.0f}* 💙"
        send(cid, msg)
    elif data == "buy":
        u["bought"] += 1
        send(cid, "💸 Logged — no shame. It was *your* call this time. 🙂")
    api("answerCallbackQuery", callback_query_id=cq["id"])


def main():
    if not TOKEN:
        raise SystemExit("Set BOT_TOKEN env var (from @BotFather).")
    print("Regret Oracle running. Ctrl+C to stop.")
    d = load()
    offset = 0
    while True:
        res = api("getUpdates", offset=offset, timeout=60)
        for upd in res.get("result", []):
            offset = upd["update_id"] + 1
            try:
                if "message" in upd:
                    handle_message(d, upd["message"])
                elif "callback_query" in upd:
                    handle_callback(d, upd["callback_query"])
                save(d)
            except Exception as e:
                print("handler error:", e)
        time.sleep(0.5)


if __name__ == "__main__":
    main()
