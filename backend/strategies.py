"""
Trading strategies for SoeClaw AI agents.
Each strategy analyzes price data and returns (action, confidence, reasoning).
Includes stop-loss, take-profit, and position sizing per strategy.
"""
from dataclasses import dataclass, field
from typing import Literal

Action = Literal["BUY", "SELL", "HOLD"]


@dataclass
class Signal:
    action: Action
    confidence: float
    reasoning: str
    stop_loss_pct: float = 2.0       # % below entry to cut loss
    take_profit_pct: float = 4.0     # % above entry to take profit
    position_size_pct: float = 10.0  # % of portfolio to allocate


def _position_size(confidence: float, base: float = 10.0, max_pct: float = 25.0) -> float:
    """Scale position size with confidence: higher confidence → larger position."""
    return round(min(max_pct, base * (confidence / 70.0)), 1)


def momentum_strategy(prices: list[float], change_24h: float) -> Signal:
    """
    AlphaQuant — Momentum.
    Rides price trends: buys accelerating uptrends, sells decelerating momentum.
    """
    if len(prices) < 3:
        return Signal("HOLD", 65.0, "Insufficient data for momentum analysis")

    recent = prices[-5:] if len(prices) >= 5 else prices
    deltas = [recent[i] - recent[i - 1] for i in range(1, len(recent))]
    avg_delta = sum(deltas) / len(deltas)
    acceleration = deltas[-1] - deltas[0] if len(deltas) > 1 else 0

    if avg_delta > 0 and acceleration >= 0 and change_24h > 1:
        conf = min(94, 68 + change_24h * 2 + acceleration * 100)
        return Signal("BUY", round(conf, 2), f"Positive momentum +{avg_delta:.4f}/tick, accelerating",
                      stop_loss_pct=1.5, take_profit_pct=4.0, position_size_pct=_position_size(conf))
    if avg_delta < 0 and change_24h < -1:
        conf = min(94, 68 + abs(change_24h) * 2)
        return Signal("SELL", round(conf, 2), f"Negative momentum {avg_delta:.4f}/tick, trend continuation",
                      stop_loss_pct=1.5, take_profit_pct=3.5, position_size_pct=_position_size(conf))
    return Signal("HOLD", round(62 + abs(change_24h), 2), "Momentum neutral, awaiting directional confirmation",
                  position_size_pct=0.0)


def mean_reversion_strategy(prices: list[float], change_24h: float) -> Signal:
    """
    WhaleWatcher — Mean Reversion.
    Identifies extreme deviations from moving average and trades the snap-back.
    """
    if len(prices) < 5:
        return Signal("HOLD", 65.0, "Insufficient data for mean reversion")

    window = min(20, len(prices))
    ma = sum(prices[-window:]) / window
    current = prices[-1]
    deviation_pct = ((current - ma) / ma) * 100

    if deviation_pct < -3 or change_24h < -5:
        conf = min(95, 65 + abs(deviation_pct) * 3)
        return Signal("BUY", round(conf, 2), f"Price {abs(deviation_pct):.1f}% below MA, mean reversion expected",
                      stop_loss_pct=2.5, take_profit_pct=abs(deviation_pct), position_size_pct=_position_size(conf))
    if deviation_pct > 3 or change_24h > 5:
        conf = min(95, 65 + deviation_pct * 3)
        return Signal("SELL", round(conf, 2), f"Price {deviation_pct:.1f}% above MA, reversion to mean likely",
                      stop_loss_pct=2.5, take_profit_pct=deviation_pct, position_size_pct=_position_size(conf))
    return Signal("HOLD", 66.0, f"Price within normal range ({deviation_pct:+.1f}% vs MA)", position_size_pct=0.0)


def trend_following_strategy(prices: list[float], change_24h: float) -> Signal:
    """
    MacroAnalyzer — Trend Following.
    Uses short vs long moving average crossover to identify trend direction.
    """
    if len(prices) < 10:
        return Signal("HOLD", 65.0, "Building trend baseline")

    short_ma = sum(prices[-5:]) / 5
    long_ma  = sum(prices[-10:]) / 10
    spread_pct = ((short_ma - long_ma) / long_ma) * 100

    if short_ma > long_ma and spread_pct > 0.1 and change_24h > 0:
        conf = min(92, 65 + spread_pct * 10 + change_24h * 0.5)
        return Signal("BUY", round(conf, 2), f"Short MA crossed above long MA (+{spread_pct:.2f}%), bullish trend",
                      stop_loss_pct=2.0, take_profit_pct=6.0, position_size_pct=_position_size(conf))
    if short_ma < long_ma and spread_pct < -0.1 and change_24h < 0:
        conf = min(92, 65 + abs(spread_pct) * 10 + abs(change_24h) * 0.5)
        return Signal("SELL", round(conf, 2), f"Short MA below long MA ({spread_pct:.2f}%), bearish trend",
                      stop_loss_pct=2.0, take_profit_pct=6.0, position_size_pct=_position_size(conf))
    return Signal("HOLD", 63.0, f"MAs converging ({spread_pct:+.2f}%), trend undecided", position_size_pct=0.0)


def volatility_strategy(prices: list[float], change_24h: float) -> Signal:
    """
    RiskManager — Volatility-Adjusted.
    Reduces risk in high-volatility regimes; captures mean-reversion in low-vol.
    """
    if len(prices) < 5:
        return Signal("HOLD", 70.0, "Calculating volatility baseline")

    window = min(15, len(prices))
    recent = prices[-window:]
    mean = sum(recent) / len(recent)
    variance = sum((p - mean) ** 2 for p in recent) / len(recent)
    vol_pct = (variance ** 0.5 / mean) * 100  # coefficient of variation

    if vol_pct > 2.5:
        if change_24h < -6:
            return Signal("BUY", 63.0, f"High vol ({vol_pct:.1f}%) + extreme dip — small contrarian buy",
                          stop_loss_pct=3.0, take_profit_pct=5.0, position_size_pct=_position_size(63.0))
        return Signal("HOLD", 72.0, f"High volatility regime ({vol_pct:.1f}%), reducing exposure",
                      position_size_pct=0.0)

    # Low volatility — mean reversion is reliable
    if change_24h < -2:
        conf = min(90, 70 + abs(change_24h) * 2)
        return Signal("BUY", round(conf, 2), f"Low vol ({vol_pct:.1f}%), dip buy with tight risk",
                      stop_loss_pct=1.5, take_profit_pct=3.0, position_size_pct=_position_size(conf))
    if change_24h > 2:
        conf = min(90, 70 + change_24h * 2)
        return Signal("SELL", round(conf, 2), f"Low vol ({vol_pct:.1f}%), taking profit on extended move",
                      stop_loss_pct=1.5, take_profit_pct=3.0, position_size_pct=_position_size(conf))
    return Signal("HOLD", 68.0, f"Low vol ({vol_pct:.1f}%), price stable — no edge", position_size_pct=0.0)


def apply_reputation_modifier(signal: Signal, reputation: int, onchain_trades: int) -> Signal:
    """
    Adjusts a strategy signal using the agent's live ERC-8004 on-chain reputation.
    This creates the feedback loop: Mantle blockchain → agent behavior → Mantle blockchain.

    Tiers:
      reputation < 0   → conservative mode: shrink position, cap confidence
      reputation 0–9   → neutral: no change (building track record)
      reputation 10–19 → proven: +30% position size
      reputation ≥ 20  → elite: up to +100% position size
    """
    if signal.action == "HOLD":
        return signal  # position size is irrelevant for holds

    if reputation < 0:
        # On losing streak — reduce exposure, cap confidence
        shrink = max(0.3, 1.0 + reputation * 0.1)   # rep=-5 → factor=0.5
        new_pos  = round(max(2.0, signal.position_size_pct * shrink), 1)
        new_conf = min(signal.confidence, 72.0)
        return Signal(
            signal.action, new_conf,
            f"{signal.reasoning} [ERC-8004 REP:{reputation} → conservative, size {new_pos}%]",
            signal.stop_loss_pct, signal.take_profit_pct, new_pos,
        )
    elif reputation >= 20:
        # Elite — up to 2× position
        amplify = min(2.0, 1.0 + reputation * 0.025)
        new_pos  = round(min(40.0, signal.position_size_pct * amplify), 1)
        return Signal(
            signal.action, signal.confidence,
            f"{signal.reasoning} [ERC-8004 REP:{reputation} elite → size {new_pos}%]",
            signal.stop_loss_pct, signal.take_profit_pct, new_pos,
        )
    elif reputation >= 10:
        # Proven — +30% position
        new_pos = round(min(30.0, signal.position_size_pct * 1.3), 1)
        return Signal(
            signal.action, signal.confidence,
            f"{signal.reasoning} [ERC-8004 REP:{reputation} proven → size {new_pos}%]",
            signal.stop_loss_pct, signal.take_profit_pct, new_pos,
        )
    # Neutral (0–9): no change
    return signal


STRATEGY_MAP = {
    "AlphaQuant":    momentum_strategy,
    "WhaleWatcher":  mean_reversion_strategy,
    "MacroAnalyzer": trend_following_strategy,
    "RiskManager":   volatility_strategy,
}


def get_strategy_signal(agent_name: str, prices: list[float], change_24h: float) -> Signal:
    fn = STRATEGY_MAP.get(agent_name, momentum_strategy)
    return fn(prices, change_24h)
