"""
Telegram Bot — sends Alpha alerts + responds to user commands.
Uses python-telegram-bot v20 (async) integrated into the FastAPI event loop.
"""
import asyncio
import os

BOT_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
ALERT_CHAT  = os.getenv("TELEGRAM_CHAT_ID", "")   # chat_id or @channelname

_bot_app = None   # telegram Application instance


async def send_telegram(markdown_text: str):
    """Called by alert_manager to push an alert message."""
    if _bot_app is None or not ALERT_CHAT:
        return
    try:
        await _bot_app.bot.send_message(
            chat_id=ALERT_CHAT,
            text=markdown_text,
            parse_mode="Markdown",
            disable_web_page_preview=True,
        )
    except Exception as e:
        print(f"[Telegram] Send error: {e}")


# ── Command Handlers ─────────────────────────────────────────────────────────

async def _cmd_start(update, ctx):
    await update.message.reply_text(
        "🤖 *SoeClaw Alpha Bot*\n\n"
        "Commands:\n"
        "/status  — agent & market status\n"
        "/prices  — live BTC, ETH, MNT prices\n"
        "/alerts  — recent alerts summary\n"
        "/help    — this message",
        parse_mode="Markdown",
    )


async def _cmd_help(update, ctx):
    await _cmd_start(update, ctx)


async def _cmd_prices(update, ctx):
    # Import price_cache lazily to avoid circular import
    try:
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from main import price_cache
        lines = []
        for sym, info in price_cache.items():
            p   = info.get("price", 0)
            chg = info.get("change_24h", 0)
            arrow = "📈" if chg >= 0 else "📉"
            lines.append(f"{arrow} *{sym}*: ${p:,.4f}  ({chg:+.2f}% 24h)")
        await update.message.reply_text("\n".join(lines) or "No price data yet.", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"Error fetching prices: {e}")


async def _cmd_status(update, ctx):
    try:
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from main import agent_running, _bybit_connected
        ws_status  = "✅ Connected" if _bybit_connected else "🟡 CoinGecko fallback"
        ag_status  = "✅ Running" if agent_running else "⛔ Stopped"
        await update.message.reply_text(
            f"*SoeClaw Status*\n"
            f"Agent loop: {ag_status}\n"
            f"Bybit WS:   {ws_status}",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"Error: {e}")


async def _cmd_alerts(update, ctx):
    from .alert_manager import _cooldown_map
    if not _cooldown_map:
        await update.message.reply_text("No alerts fired yet.")
        return
    import time
    lines = ["*Recent alerts (last fired):*"]
    for key, ts in sorted(_cooldown_map.items(), key=lambda x: -x[1])[:10]:
        ago = int(time.time() - ts)
        lines.append(f"• `{key}` — {ago}s ago")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


# ── Startup ──────────────────────────────────────────────────────────────────

async def start_telegram_bot():
    global _bot_app

    if not BOT_TOKEN:
        print("[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled")
        return

    try:
        from telegram.ext import Application, CommandHandler

        app = Application.builder().token(BOT_TOKEN).build()
        app.add_handler(CommandHandler("start",  _cmd_start))
        app.add_handler(CommandHandler("help",   _cmd_help))
        app.add_handler(CommandHandler("prices", _cmd_prices))
        app.add_handler(CommandHandler("status", _cmd_status))
        app.add_handler(CommandHandler("alerts", _cmd_alerts))

        await app.initialize()
        await app.start()
        if app.updater:
            await app.updater.start_polling(drop_pending_updates=True)

        _bot_app = app
        print(f"[Telegram] Bot started — alert chat: {ALERT_CHAT or 'not set'}")

    except ImportError:
        print("[Telegram] python-telegram-bot not installed — bot disabled")
    except Exception as e:
        print(f"[Telegram] Failed to start: {e}")
