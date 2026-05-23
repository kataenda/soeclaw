"""
Central alert dispatcher — receives alerts from whale tracker & anomaly detector,
sends them to Telegram and/or Discord. Has rate limiting to prevent spam.
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Literal

AlertType = Literal["WHALE", "PRICE_SPIKE", "PRICE_CRASH", "ANOMALY", "VOLUME"]
Severity  = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

SEVERITY_EMOJI = {"LOW": "🟡", "MEDIUM": "🟠", "HIGH": "🔴", "CRITICAL": "🚨"}
COOLDOWN_SECS  = 300  # same alert type + symbol can't fire more than once per 5 min


@dataclass
class Alert:
    type:     AlertType
    title:    str
    message:  str
    severity: Severity
    symbol:   str = ""
    ts:       float = field(default_factory=time.time)


_alert_queue:    asyncio.Queue | None = None
_telegram_send = None   # set by telegram_bot
_discord_send  = None   # set by discord_bot
_cooldown_map: dict[str, float] = {}   # key → last sent timestamp
_recent_alerts: list[Alert]     = []   # ring buffer for frontend display (max 50)


def set_telegram_sender(fn):
    global _telegram_send
    _telegram_send = fn


def set_discord_sender(fn):
    global _discord_send
    _discord_send = fn


async def dispatch_alert(alert: Alert):
    if _alert_queue is None:
        return
    # Rate limit: same (type, symbol) pair silenced for COOLDOWN_SECS
    key = f"{alert.type}:{alert.symbol}"
    if time.time() - _cooldown_map.get(key, 0) < COOLDOWN_SECS:
        return
    _cooldown_map[key] = time.time()
    await _alert_queue.put(alert)


def _format(alert: Alert) -> str:
    emoji = SEVERITY_EMOJI.get(alert.severity, "ℹ️")
    return f"{emoji} *{alert.title}*\n{alert.message}\n_SoeClaw Alpha · {time.strftime('%H:%M UTC', time.gmtime(alert.ts))}_"


async def _dispatcher_loop():
    global _alert_queue
    _alert_queue = asyncio.Queue()
    print("[Alpha] Alert dispatcher ready")

    while True:
        alert = await _alert_queue.get()
        _recent_alerts.insert(0, alert)
        if len(_recent_alerts) > 50:
            _recent_alerts.pop()
        text  = _format(alert)
        print(f"[Alpha] Dispatching alert: {alert.title}")

        if _telegram_send:
            try:
                await _telegram_send(text)
            except Exception as e:
                print(f"[Alpha] Telegram error: {e}")

        if _discord_send:
            try:
                await _discord_send(text)
            except Exception as e:
                print(f"[Alpha] Discord error: {e}")

        _alert_queue.task_done()


async def start_alpha_system(price_cache: dict, price_history: dict):
    """Entry point — called from main.py startup_event."""
    from .telegram_bot   import start_telegram_bot, send_telegram
    from .discord_bot    import send_discord
    from .anomaly_detector import anomaly_detection_loop
    from .whale_tracker    import whale_tracking_loop

    set_telegram_sender(send_telegram)
    set_discord_sender(send_discord)

    asyncio.create_task(_dispatcher_loop())
    asyncio.create_task(start_telegram_bot())
    asyncio.create_task(anomaly_detection_loop(price_cache, price_history))
    asyncio.create_task(whale_tracking_loop())

    print("[Alpha] AI Alpha & Data system started")
