"""
Backtesting engine for SoeClaw strategies.
Uses 7-day hourly CoinGecko data to evaluate strategy performance.
"""
import httpx
import math
from dataclasses import dataclass, field
from strategies import get_strategy_signal

COINGECKO_IDS = {
    "BTC/USDT": "bitcoin",
    "ETH/USDT": "ethereum",
    "MNT/USDT": "mantle",
}


@dataclass
class BacktestResult:
    agent_name: str
    symbol: str
    total_trades: int
    winning_trades: int
    win_rate: float        # %
    total_roi: float       # %
    sharpe_ratio: float
    max_drawdown: float    # %
    avg_confidence: float


async def fetch_historical_prices(symbol: str, days: int = 7) -> list[float]:
    cg_id = COINGECKO_IDS.get(symbol)
    if not cg_id:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart",
                params={"vs_currency": "usd", "days": days, "interval": "hourly"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return [p[1] for p in data.get("prices", [])]
    except Exception as e:
        print(f"[Backtest] Failed to fetch history for {symbol}: {e}")
    return []


def _sharpe(returns: list[float]) -> float:
    if len(returns) < 2:
        return 0.0
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / len(returns)
    std = math.sqrt(variance) if variance > 0 else 0
    return round((mean / std) * math.sqrt(252) if std > 0 else 0.0, 3)


def _max_drawdown(equity: list[float]) -> float:
    peak = equity[0]
    max_dd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 2)


async def run_backtest(agent_name: str, symbol: str) -> BacktestResult | None:
    prices = await fetch_historical_prices(symbol)
    if len(prices) < 20:
        return None

    # Simulate walk-forward: look at windows of 10 candles, decide, hold for 1
    equity = [100.0]
    trades, wins = 0, 0
    confidences: list[float] = []
    returns: list[float] = []

    window = 10
    position = None   # {"side": "BUY"/"SELL", "entry": float}

    for i in range(window, len(prices) - 1):
        window_prices = prices[i - window: i]
        current = prices[i]
        next_price = prices[i + 1]

        # Compute 24h change from 24 candles ago
        ref_idx = max(0, i - 24)
        change_24h = ((current - prices[ref_idx]) / prices[ref_idx]) * 100

        signal = get_strategy_signal(agent_name, window_prices, change_24h)

        if signal.action == "BUY" and position is None:
            position = {"side": "BUY", "entry": current, "conf": signal.confidence}
            confidences.append(signal.confidence)

        elif signal.action == "SELL" and position is None:
            position = {"side": "SELL", "entry": current, "conf": signal.confidence}
            confidences.append(signal.confidence)

        elif position is not None and signal.action != position["side"]:
            # Exit position
            entry = position["entry"]
            if position["side"] == "BUY":
                ret = (next_price - entry) / entry * 100
            else:
                ret = (entry - next_price) / entry * 100

            equity.append(equity[-1] * (1 + ret / 100))
            returns.append(ret)
            trades += 1
            if ret > 0:
                wins += 1
            position = None

    total_roi = round(equity[-1] - 100.0, 2) if equity else 0.0
    win_rate  = round((wins / trades * 100) if trades > 0 else 0.0, 1)
    avg_conf  = round(sum(confidences) / len(confidences) if confidences else 0.0, 1)

    return BacktestResult(
        agent_name=agent_name,
        symbol=symbol,
        total_trades=trades,
        winning_trades=wins,
        win_rate=win_rate,
        total_roi=total_roi,
        sharpe_ratio=_sharpe(returns),
        max_drawdown=_max_drawdown(equity),
        avg_confidence=avg_conf,
    )
