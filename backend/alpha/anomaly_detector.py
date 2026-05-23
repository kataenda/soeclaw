"""
Anomaly Detector — analyzes price_cache and price_history every 60s.
Detects: sudden price spike/crash per tick, extreme 24h moves,
RSI overbought/oversold, and low-liquidity divergence between agents.
"""
import asyncio
import math
from .alert_manager import dispatch_alert, Alert

# ── Thresholds ───────────────────────────────────────────────────────────────
TICK_SPIKE_PCT   =  3.5   # % change in one 60s tick → spike alert
TICK_CRASH_PCT   = -3.5   # % change in one 60s tick → crash alert
DAY_EXTREME_PCT  =  8.0   # abs 24h change → extreme move alert
RSI_PERIOD       = 14
RSI_OVERBOUGHT   = 75
RSI_OVERSOLD     = 25
VOL_SPIKE_FACTOR =  2.5   # std devs above mean volume → volume alert


def _rsi(prices: list[float]) -> float | None:
    if len(prices) < RSI_PERIOD + 1:
        return None
    gains, losses = [], []
    for i in range(1, RSI_PERIOD + 1):
        diff = prices[-RSI_PERIOD + i] - prices[-RSI_PERIOD + i - 1]
        (gains if diff > 0 else losses).append(abs(diff))
    avg_gain = sum(gains) / RSI_PERIOD
    avg_loss = sum(losses) / RSI_PERIOD
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _volatility_spike(prices: list[float]) -> bool:
    """True if the last tick's move is > VOL_SPIKE_FACTOR std devs above mean move."""
    if len(prices) < 10:
        return False
    returns = [abs((prices[i] - prices[i-1]) / prices[i-1]) * 100
               for i in range(1, len(prices))]
    mean = sum(returns) / len(returns)
    std  = math.sqrt(sum((r - mean)**2 for r in returns) / len(returns))
    if std == 0:
        return False
    last_ret = returns[-1]
    return last_ret > mean + VOL_SPIKE_FACTOR * std


async def anomaly_detection_loop(price_cache: dict, price_history: dict):
    prev_prices: dict[str, float] = {}
    print("[Anomaly] Detector started")

    while True:
        await asyncio.sleep(60)

        for symbol, info in price_cache.items():
            price     = info.get("price", 0)
            change_24h = info.get("change_24h", 0)
            history   = price_history.get(symbol, [])

            if price == 0:
                continue

            # ── 1. Per-tick spike / crash ────────────────────────────────────
            if symbol in prev_prices and prev_prices[symbol] > 0:
                tick_pct = ((price - prev_prices[symbol]) / prev_prices[symbol]) * 100

                if tick_pct >= TICK_SPIKE_PCT:
                    await dispatch_alert(Alert(
                        type="PRICE_SPIKE",
                        title=f"🚀 Price Spike — {symbol}",
                        message=(
                            f"*{tick_pct:+.2f}%* in the last 60 seconds\n"
                            f"Price: ${price:,.4f}\n"
                            f"24h change: {change_24h:+.2f}%"
                        ),
                        severity="HIGH",
                        symbol=symbol,
                    ))

                elif tick_pct <= TICK_CRASH_PCT:
                    await dispatch_alert(Alert(
                        type="PRICE_CRASH",
                        title=f"💥 Price Crash — {symbol}",
                        message=(
                            f"*{tick_pct:+.2f}%* in the last 60 seconds\n"
                            f"Price: ${price:,.4f}\n"
                            f"24h change: {change_24h:+.2f}%"
                        ),
                        severity="HIGH",
                        symbol=symbol,
                    ))

            # ── 2. Extreme 24h move ──────────────────────────────────────────
            if change_24h >= DAY_EXTREME_PCT:
                await dispatch_alert(Alert(
                    type="ANOMALY",
                    title=f"📈 Extreme Gain — {symbol}",
                    message=(
                        f"24h change: *+{change_24h:.2f}%*\n"
                        f"Price: ${price:,.4f}\n"
                        f"Possible momentum breakout."
                    ),
                    severity="MEDIUM",
                    symbol=f"{symbol}:24h_up",
                ))

            elif change_24h <= -DAY_EXTREME_PCT:
                await dispatch_alert(Alert(
                    type="ANOMALY",
                    title=f"📉 Extreme Drop — {symbol}",
                    message=(
                        f"24h change: *{change_24h:.2f}%*\n"
                        f"Price: ${price:,.4f}\n"
                        f"Possible capitulation or liquidation cascade."
                    ),
                    severity="MEDIUM",
                    symbol=f"{symbol}:24h_down",
                ))

            # ── 3. RSI overbought / oversold ─────────────────────────────────
            if len(history) >= RSI_PERIOD + 1:
                rsi = _rsi(history)
                if rsi is not None:
                    if rsi >= RSI_OVERBOUGHT:
                        await dispatch_alert(Alert(
                            type="ANOMALY",
                            title=f"⚠️ RSI Overbought — {symbol}",
                            message=(
                                f"RSI: *{rsi:.1f}* (threshold {RSI_OVERBOUGHT})\n"
                                f"Price: ${price:,.4f}\n"
                                f"Potential reversal zone."
                            ),
                            severity="LOW",
                            symbol=f"{symbol}:rsi_ob",
                        ))
                    elif rsi <= RSI_OVERSOLD:
                        await dispatch_alert(Alert(
                            type="ANOMALY",
                            title=f"⚠️ RSI Oversold — {symbol}",
                            message=(
                                f"RSI: *{rsi:.1f}* (threshold {RSI_OVERSOLD})\n"
                                f"Price: ${price:,.4f}\n"
                                f"Potential bounce zone."
                            ),
                            severity="LOW",
                            symbol=f"{symbol}:rsi_os",
                        ))

            # ── 4. Volatility spike ──────────────────────────────────────────
            if len(history) >= 10 and _volatility_spike(history):
                await dispatch_alert(Alert(
                    type="VOLUME",
                    title=f"⚡ Volatility Spike — {symbol}",
                    message=(
                        f"Unusual tick-level volatility detected\n"
                        f"Price: ${price:,.4f}\n"
                        f"Exercise caution — potential stop hunt or news event."
                    ),
                    severity="MEDIUM",
                    symbol=f"{symbol}:vol_spike",
                ))

            prev_prices[symbol] = price
