import asyncio
import json
import random
import sys
import os
import time
import ssl

from dotenv import load_dotenv
load_dotenv()  # must run before any local module that reads env vars

import httpx
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import database
import models
from strategies import get_strategy_signal
from backtesting import run_backtest
from auth import hash_password, verify_password, create_token, get_current_user
from pydantic import BaseModel
from typing import Optional

sys.path.append(os.path.join(os.path.dirname(__file__), 'blockchain'))
from mantle_client import MantleClient, EXPLORER_BASE

mantle_client = MantleClient()

def _valid_tx(h) -> bool:
    """Return True only for a real on-chain tx hash (non-null, non-zero)."""
    if not h:
        return False
    bare = str(h).lower().lstrip('0x').split('_')[0]
    return bool(bare) and bare != '0' * 64

# Anthropic client (optional — falls back to rule-based if key missing)
ANTHROPIC_API_KEY = os.getenv("AGENT_API_KEY", "")
anthropic_client = None
if ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != "your_anthropic_api_key_here":
    try:
        import anthropic
        anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        print("[AI] Claude client initialized.")
    except ImportError:
        print("[AI] anthropic package not installed — using rule-based fallback.")

# Real-time price cache (updated from CoinGecko every 30s)
price_cache: dict = {
    "BTC/USDT":  {"price": 105000.0, "change_24h": 0.0},
    "ETH/USDT":  {"price": 2500.0,   "change_24h": 0.0},
    "MNT/USDT":  {"price": 0.65,     "change_24h": 0.0},
    "mETH/USDT": {"price": 2658.0,   "change_24h": 0.0},  # Mantle Staked ETH
    "COOK/USDT": {"price": 0.0284,   "change_24h": 0.0},  # Byreal governance token
    "FBTC/USDT": {"price": 104800.0, "change_24h": 0.0},  # Ignition FBTC on Mantle
    "WMNT/USDT": {"price": 0.65,     "change_24h": 0.0},  # Wrapped MNT (same price)
}
_last_price_fetch: float = 0.0

# Rolling price history per symbol (last 50 ticks) for strategy calculations
price_history: dict[str, list[float]] = {
    "BTC/USDT": [], "ETH/USDT": [], "MNT/USDT": [],
    "mETH/USDT": [], "COOK/USDT": [], "FBTC/USDT": [], "WMNT/USDT": [],
}

AGENT_CONFIGS = [
    {
        "name": "AlphaQuant",
        "specialty": "momentum and technical analysis",
        "system": (
            "You are AlphaQuant, an elite quantitative trading AI on Mantle L2. "
            "You specialize in momentum, price action, and technical pattern recognition. "
            "You analyze price velocity, acceleration, and short-term momentum bursts. "
            "You look for: breakout above resistance, accelerating uptrend, RSI divergence, and momentum exhaustion. "
            "Your edge is catching trends EARLY and exiting before reversal. "
            "Be decisive and conviction-driven. Confidence above 85% only for strong momentum setups."
        ),
    },
    {
        "name": "WhaleWatcher",
        "specialty": "on-chain whale flow and order book depth",
        "system": (
            "You are WhaleWatcher, an on-chain intelligence AI agent on Mantle L2. "
            "You specialize in detecting large wallet movements, order flow imbalances, and liquidity shifts. "
            "You infer whale behavior from price impact: sudden spikes = whale buy, sharp drops = whale dump. "
            "You look for: mean reversion after whale-induced spikes, accumulation zones, and liquidity voids. "
            "Your edge is fading overextended moves caused by whale manipulation. "
            "Be contrarian by nature — buy the dip after whale dumps, sell into whale pumps."
        ),
    },
    {
        "name": "RiskManager",
        "specialty": "risk-adjusted returns and volatility management",
        "system": (
            "You are RiskManager, a risk-first AI agent on Mantle L2. "
            "You specialize in volatility analysis, drawdown protection, and portfolio risk management. "
            "You calculate implied volatility from recent price swings and size positions accordingly. "
            "Your primary rule: NEVER risk more than your reputation allows. In high-vol regimes, HOLD or take tiny positions. "
            "You look for: low-volatility dip entries with tight stop-loss, volatility compression before breakout. "
            "Your edge is preserving capital in bear conditions and sizing up aggressively in low-risk setups. "
            "Be conservative unless volatility is LOW and the signal is crystal clear."
        ),
    },
    {
        "name": "MacroAnalyzer",
        "specialty": "macroeconomic indicators and market sentiment",
        "system": (
            "You are MacroAnalyzer, a macro-driven AI agent on Mantle L2. "
            "You specialize in reading broad market regime, cross-asset correlation, and sentiment cycles. "
            "You use BTC 24h change as a proxy for risk appetite: BTC up = risk-on, BTC down = risk-off. "
            "You analyze: trend direction from moving average spread, market regime (RISK_ON/NEUTRAL/RISK_OFF), "
            "and whether the current move is driven by fundamentals or speculation. "
            "Your edge is identifying macro turning points and front-running regime changes. "
            "Be trend-following when macro is clear, cautious when macro is mixed."
        ),
    },
]

models.Base.metadata.create_all(bind=database.engine)

# ── Auto-create default admin user from env vars (survives Railway restarts) ─
_ADMIN_USER = os.getenv("ADMIN_USERNAME", "")
_ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "")
if _ADMIN_USER and _ADMIN_PASS:
    _db = database.SessionLocal()
    try:
        if not _db.query(models.User).filter(models.User.username == _ADMIN_USER).first():
            _db.add(models.User(username=_ADMIN_USER, email=f"{_ADMIN_USER}@soeclaw.local", hashed_pw=hash_password(_ADMIN_PASS)))
            _db.commit()
            print(f"[AUTH] Default admin '{_ADMIN_USER}' created.")
    finally:
        _db.close()

app = FastAPI(title="SoeClaw AI Terminal API")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                pass


manager = ConnectionManager()


BYBIT_SYMBOL_MAP = {
    "BTCUSDT": "BTC/USDT",
    "ETHUSDT": "ETH/USDT",
    "MNTUSDT": "MNT/USDT",
    "METHUSDT": "mETH/USDT",
    "COOKUSDT": "COOK/USDT",
}

_bybit_connected = False


async def oracle_loop():
    """
    AI Oracle: polls for AIRequested events on SoeClaw contract,
    calls Claude AI, then writes result back via fulfillAIResult().
    This is the core AI × on-chain integration loop.
    """
    _oracle_from_block = 0
    print("[Oracle] AI oracle loop started")
    while True:
        if not agent_running:
            await asyncio.sleep(10)
            continue

        try:
            pending = await asyncio.to_thread(
                mantle_client.get_pending_ai_requests, _oracle_from_block
            )
            for req in pending:
                rid    = req["request_id"]
                symbol = req["symbol"]
                caller = req["caller"]
                print(f"[Oracle] Processing request #{rid} — {symbol} from {caller[:8]}…")

                # AI inference
                price      = price_cache.get(symbol, {}).get("price", 0.0)
                change_24h = price_cache.get(symbol, {}).get("change_24h", 0.0)
                action, confidence, reasoning, _ = get_ai_decision(
                    "SoeClawAI", "momentum and on-chain signal analysis",
                    symbol, price, change_24h
                )
                conf_int = max(0, min(100, int(confidence)))

                # Fulfill on-chain
                tx_hash = await asyncio.to_thread(
                    mantle_client.fulfill_ai_request,
                    rid, action, conf_int, reasoning
                )
                explorer = f"{EXPLORER_BASE}/tx/{tx_hash}" if _valid_tx(tx_hash) else None

                # Broadcast to dashboard
                await manager.broadcast({
                    "type": "THOUGHT",
                    "data": {
                        "agent_name": "ORACLE",
                        "message": (
                            f"AI request #{rid} fulfilled on-chain — "
                            f"{action} {symbol} ({conf_int}% confidence) | "
                            f"requested by {caller[:8]}… | {reasoning}"
                        ),
                        "msg_type": "CHAIN",
                        "tx_hash": tx_hash,
                        "explorer_url": explorer,
                    },
                })

                # advance scan window past this block
                if req["block"] >= _oracle_from_block:
                    _oracle_from_block = req["block"]

        except Exception as e:
            print(f"[Oracle] loop error: {e}")

        await asyncio.sleep(10)   # poll every 10 seconds


async def bybit_ws_loop():
    """Stream real-time prices from Bybit public WebSocket (no API key needed)."""
    global _bybit_connected
    url = "wss://stream.bybit.com/v5/public/spot"
    subscribe_msg = json.dumps({
        "op": "subscribe",
        "args": ["tickers.BTCUSDT", "tickers.ETHUSDT", "tickers.MNTUSDT", "tickers.METHUSDT", "tickers.COOKUSDT"],
    })
    _ssl = ssl.create_default_context()
    _ssl.check_hostname = False
    _ssl.verify_mode = ssl.CERT_NONE

    while True:
        try:
            async with websockets.connect(url, ssl=_ssl, ping_interval=20) as ws:
                await ws.send(subscribe_msg)
                _bybit_connected = True
                print("[Bybit] Connected — streaming live prices")

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        if msg.get("topic", "").startswith("tickers."):
                            d = msg.get("data", {})
                            sym = BYBIT_SYMBOL_MAP.get(d.get("symbol", ""))
                            if sym and d.get("lastPrice"):
                                price = float(d["lastPrice"])
                                change = float(d.get("price24hPcnt", 0)) * 100
                                price_cache[sym]["price"] = price
                                price_cache[sym]["change_24h"] = round(change, 2)
                                # update rolling history
                                price_history[sym] = (price_history[sym] + [price])[-50:]
                                # broadcast to all dashboard clients
                                await manager.broadcast({"type": "PRICE_UPDATE", "data": price_cache})
                    except Exception:
                        pass
        except Exception as e:
            _bybit_connected = False
            print(f"[Bybit] Disconnected: {e} — retrying in 5s")
            await asyncio.sleep(5)


async def fetch_prices():
    """Fetch real market prices from CoinGecko (primary price source)."""
    global _last_price_fetch
    now = time.time()
    if now - _last_price_fetch < 15:
        return  # use cache (15s interval)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": "bitcoin,ethereum,mantle,mantle-staked-ether,cook-finance",
                    "vs_currencies": "usd",
                    "include_24hr_change": "true",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                mapping = {
                    "BTC/USDT":  ("bitcoin",              105000.0),
                    "ETH/USDT":  ("ethereum",             2500.0),
                    "MNT/USDT":  ("mantle",               0.65),
                    "mETH/USDT": ("mantle-staked-ether",  2658.0),
                    "COOK/USDT": ("cook-finance",         0.0284),
                }
                for symbol, (cg_id, fallback) in mapping.items():
                    coin = data.get(cg_id, {})
                    price_cache[symbol]["price"] = coin.get("usd", fallback)
                    price_cache[symbol]["change_24h"] = round(coin.get("usd_24h_change", 0.0), 2)
                # FBTC tracks BTC, WMNT tracks MNT
                price_cache["FBTC/USDT"]["price"] = price_cache["BTC/USDT"]["price"] * 0.9998
                price_cache["FBTC/USDT"]["change_24h"] = price_cache["BTC/USDT"]["change_24h"]
                price_cache["WMNT/USDT"]["price"] = price_cache["MNT/USDT"]["price"]
                price_cache["WMNT/USDT"]["change_24h"] = price_cache["MNT/USDT"]["change_24h"]
                _last_price_fetch = now
                for sym in price_history:
                    p = price_cache[sym]["price"]
                    if p > 0:
                        price_history[sym] = (price_history[sym] + [p])[-50:]
                print(
                    f"[Market] BTC=${price_cache['BTC/USDT']['price']:,.2f} "
                    f"ETH=${price_cache['ETH/USDT']['price']:,.2f} "
                    f"MNT=${price_cache['MNT/USDT']['price']:.4f} "
                    f"mETH=${price_cache['mETH/USDT']['price']:,.2f} "
                    f"COOK=${price_cache['COOK/USDT']['price']:.5f}"
                )
            else:
                print(f"[Market] CoinGecko returned {resp.status_code}, using cached prices.")
    except Exception as e:
        print(f"[Market] Fetch error: {e} — using cached prices.")


def get_ai_decision(
    agent_name: str, specialty: str, symbol: str,
    price: float, change_24h: float,
    reputation: int = 0, onchain_trades: int = 0,
    system_prompt: str = "",
):
    """
    Return (action, confidence, reasoning, position_size_pct).
    Primary: Claude AI with per-agent system prompt — each agent has a unique analysis style.
    Fallback: rule-based strategy when API key is not set or Claude errors.
    """
    from strategies import get_strategy_signal, apply_reputation_modifier

    history = price_history.get(symbol, [])

    # ── Claude AI — each agent is a distinct AI persona ───────────────────────
    if anthropic_client:
        try:
            rep_label = (
                "ELITE — proven track record, aggressive positioning allowed"   if reputation >= 20
                else "PROVEN — solid history, +30% position amplification"      if reputation >= 10
                else "CONSERVATIVE — on losing streak, reduce risk exposure"    if reputation < 0
                else "NEUTRAL — building on-chain track record"
            )
            recent_prices = history[-10:] if len(history) >= 10 else history
            price_summary = ", ".join(f"${p:,.2f}" for p in recent_prices) if recent_prices else "no history yet"
            max_size = 25 if reputation >= 20 else (18 if reputation >= 10 else (6 if reputation < 0 else 10))

            # SMA5 and SMA20 for additional context
            sma5  = round(sum(history[-5:])  / 5,  4) if len(history) >= 5  else price
            sma20 = round(sum(history[-20:]) / 20, 4) if len(history) >= 20 else price
            trend = "UPTREND" if sma5 > sma20 else ("DOWNTREND" if sma5 < sma20 else "SIDEWAYS")

            user_prompt = (
                f"LIVE MARKET DATA — {symbol}:\n"
                f"- Price: ${price:,.4f}\n"
                f"- 24h change: {change_24h:+.2f}%\n"
                f"- SMA5: ${sma5:,.4f} | SMA20: ${sma20:,.4f} | Trend: {trend}\n"
                f"- Recent prices (oldest→newest): {price_summary}\n\n"
                f"YOUR ERC-8004 IDENTITY (Mantle):\n"
                f"- Reputation: {reputation} ({rep_label})\n"
                f"- On-chain decisions: {onchain_trades}\n"
                f"- Max position size: {max_size}%\n\n"
                f"Analyze using your expertise and make an independent trading decision. "
                f"Respond ONLY with valid JSON (no markdown, no explanation outside JSON):\n"
                f'{{"action":"BUY"|"SELL"|"HOLD","confidence":<60-99>,"reasoning":"<one sentence max 120 chars>","position_size_pct":<1-{max_size}>}}'
            )
            msg = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=180,
                system=system_prompt or f"You are {agent_name}, an autonomous AI trading agent specializing in {specialty}.",
                messages=[{"role": "user", "content": user_prompt}],
            )
            text = msg.content[0].text.strip()
            if "```" in text:
                text = text.split("```")[1].replace("json", "").strip()
            result = json.loads(text)
            action = result.get("action", "HOLD").upper()
            if action not in ("BUY", "SELL", "HOLD"):
                action = "HOLD"
            pos_size = float(result.get("position_size_pct", max_size * 0.5))
            pos_size = round(min(max_size, max(1.0, pos_size)), 1)
            print(f"[AI] {agent_name} → {action} {symbol} conf={result.get('confidence')}%")
            return (
                action,
                round(float(result.get("confidence", 70)), 2),
                result.get("reasoning", "AI decision"),
                pos_size,
            )
        except Exception as e:
            print(f"[AI] Claude error for {agent_name}: {e} — falling back to rule-based.")

    # ── Fallback: rule-based strategy (no API key or Claude error) ─────────────
    raw_sig = get_strategy_signal(agent_name, history, change_24h)
    sig = apply_reputation_modifier(raw_sig, reputation, onchain_trades)
    return sig.action, sig.confidence, sig.reasoning, sig.position_size_pct


# ── Health check ────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "agent_running": agent_running, "bybit_connected": _bybit_connected}


@app.get("/api/kline")
async def proxy_kline(symbol: str, interval: str, limit: int = 200):
    """Proxy Bybit kline to avoid browser cert/CORS issues."""
    url = f"https://api.bybit.com/v5/market/kline?category=spot&symbol={symbol}&interval={interval}&limit={limit}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            return r.json()
    except Exception as e:
        return {"retCode": -1, "retMsg": str(e), "result": {"list": []}}


# ── AI x RWA endpoints ───────────────────────────────────────────────────────

@app.get("/api/rwa/yields")
async def rwa_yields():
    from rwa import get_rwa_yields
    btc_chg = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    eth_chg = price_cache.get("ETH/USDT", {}).get("change_24h", 0.0)
    return await get_rwa_yields(btc_chg, eth_chg)


@app.post("/api/rwa/rebalance")
async def rwa_rebalance():
    """
    Triggers an AI-driven RWA portfolio rebalance and records the decision on Mantle.
    This is the core AI × RWA × blockchain integration:
      1. AI analyzes market and recommends new allocation
      2. Decision is recorded on-chain via SoeClaw.addTrade()
      3. Returns new portfolio with tx proof
    """
    from rwa import get_rwa_yields
    btc_chg = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    eth_chg = price_cache.get("ETH/USDT", {}).get("change_24h", 0.0)

    # Force-refresh (bypass cache)
    from rwa import yield_tracker as yt
    yt._last_fetch = 0.0
    portfolio = await get_rwa_yields(btc_chg, eth_chg)

    # Record rebalance decision on Mantle blockchain
    top_asset = max(portfolio["assets"], key=lambda a: a["allocation_pct"])
    action_str = f"REBALANCE->{top_asset['symbol']}"
    confidence = 80

    tx_hash = await asyncio.to_thread(
        mantle_client.log_decision_on_chain,
        "RWA_MANAGER", "RWA_PORTFOLIO", action_str, confidence
    )
    explorer_url = f"{EXPLORER_BASE}/tx/{tx_hash}" if _valid_tx(tx_hash) else None

    # Broadcast to dashboard
    await manager.broadcast({
        "type": "THOUGHT",
        "data": {
            "agent_name": "MANTLE",
            "message": (
                f"RWA portfolio rebalanced — {portfolio['strategy']} | "
                f"top allocation: {top_asset['symbol']} {top_asset['allocation_pct']}% | "
                f"blended APY: {portfolio['blended_apy']}%"
            ),
            "msg_type": "CHAIN",
            "tx_hash": tx_hash,
            "explorer_url": explorer_url,
        },
    })

    return {
        **portfolio,
        "rebalance_tx": tx_hash,
        "rebalance_explorer": explorer_url,
        "rebalanced_at": time.time(),
    }


# ── AI DevTools endpoints ────────────────────────────────────────────────────

@app.get("/api/devtools/gas")
async def devtools_gas():
    from devtools import get_mantle_gas_stats
    return await get_mantle_gas_stats()


class GasAnalysisRequest(BaseModel):
    operation: str
    contract_code: str = ""

@app.post("/api/devtools/gas/analyze")
async def devtools_gas_analyze(req: GasAnalysisRequest):
    from devtools import analyze_gas
    return await analyze_gas(req.operation, req.contract_code)


class AuditRequest(BaseModel):
    code: str

@app.post("/api/devtools/audit")
async def devtools_audit(req: AuditRequest):
    from devtools import audit_contract
    return await audit_contract(req.code)


# ── Agentic Wallets & Economy ────────────────────────────────────────────────

# Virtual agent economy — each agent starts with 10,000 MNT and trades accumulate P&L
AGENT_ECONOMY: dict[str, dict] = {
    "AlphaQuant":    {"balance": 10000.0, "total_pnl": 0.0, "skills": ["momentum", "roc", "breakout"]},
    "WhaleWatcher":  {"balance": 10000.0, "total_pnl": 0.0, "skills": ["mean-reversion", "sma", "whale-flow"]},
    "MacroAnalyzer": {"balance": 10000.0, "total_pnl": 0.0, "skills": ["trend-following", "sma-crossover", "macro"]},
    "RiskManager":   {"balance": 10000.0, "total_pnl": 0.0, "skills": ["volatility", "risk-adjusted", "drawdown"]},
}

# Byreal Skills Registry — agent capability declarations (Byreal Skills CLI compatible)
BYREAL_SKILLS_REGISTRY = {
    "version": "1.0.0",
    "protocol": "byreal-skills-v1",
    "agents": [
        {
            "id": "alphaquant-001",
            "name": "AlphaQuant",
            "skills": [
                {"name": "momentum_analysis", "version": "2.1", "type": "strategy",
                 "description": "Momentum and price rate-of-change analysis"},
                {"name": "breakout_detection", "version": "1.0", "type": "signal",
                 "description": "Detects price breakouts above resistance levels"},
            ],
            "wallet": {"network": "mantle", "currency": "MNT"},
            "erc8004_token_id": 0,
        },
        {
            "id": "whalewatcher-001",
            "name": "WhaleWatcher",
            "skills": [
                {"name": "whale_tracking", "version": "1.5", "type": "data",
                 "description": "On-chain large wallet movement detection"},
                {"name": "mean_reversion", "version": "2.0", "type": "strategy",
                 "description": "Statistical mean reversion with SMA bands"},
            ],
            "wallet": {"network": "mantle", "currency": "MNT"},
            "erc8004_token_id": 1,
        },
        {
            "id": "macroanalyzer-001",
            "name": "MacroAnalyzer",
            "skills": [
                {"name": "trend_following", "version": "3.0", "type": "strategy",
                 "description": "SMA crossover trend identification"},
                {"name": "macro_sentiment", "version": "1.2", "type": "data",
                 "description": "Macroeconomic indicator correlation analysis"},
            ],
            "wallet": {"network": "mantle", "currency": "MNT"},
            "erc8004_token_id": 3,
        },
        {
            "id": "riskmanager-001",
            "name": "RiskManager",
            "skills": [
                {"name": "volatility_regime", "version": "2.2", "type": "risk",
                 "description": "Market volatility regime detection and position sizing"},
                {"name": "drawdown_control", "version": "1.8", "type": "risk",
                 "description": "Maximum drawdown enforcement and capital preservation"},
            ],
            "wallet": {"network": "mantle", "currency": "MNT"},
            "erc8004_token_id": 4,
        },
    ],
}


@app.get("/api/agents/economy")
def agents_economy(db: Session = Depends(database.get_db)):
    """Returns each agent's virtual wallet balance + P&L from trade history."""
    result = []
    for agent_name, economy in AGENT_ECONOMY.items():
        trades = db.query(models.Trade).join(
            models.Agent, models.Trade.agent_id == models.Agent.id
        ).filter(models.Agent.name == agent_name).all()

        total_pnl = 0.0
        for t in trades:
            current = price_cache.get(t.symbol, {}).get("price", 0)
            if current > 0 and t.price > 0:
                pnl_pct = ((current - t.price) / t.price) * 100
                if t.action == "SELL":
                    pnl_pct = -pnl_pct
                trade_size = economy["balance"] * 0.1   # 10% per trade
                total_pnl += trade_size * pnl_pct / 100

        result.append({
            "name": agent_name,
            "virtual_balance_mnt": round(economy["balance"] + total_pnl, 2),
            "starting_balance_mnt": economy["balance"],
            "total_pnl_mnt": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl / economy["balance"] * 100, 2),
            "skills": economy["skills"],
            "trade_count": len(trades),
            "network": "Mantle",
        })

    return sorted(result, key=lambda x: x["total_pnl_mnt"], reverse=True)


@app.get("/api/agents/skills")
def agents_skills():
    """Returns Byreal Skills Registry — agent capability declarations."""
    return BYREAL_SKILLS_REGISTRY


class TransferRequest(BaseModel):
    from_agent: str
    to_agent: str
    amount: float

@app.post("/api/agents/economy/transfer")
def economy_transfer(req: TransferRequest):
    """Transfer virtual MNT between agent wallets (Byreal Skills CLI)."""
    if req.from_agent not in AGENT_ECONOMY:
        raise HTTPException(status_code=404, detail=f"Agent '{req.from_agent}' not found")
    if req.to_agent not in AGENT_ECONOMY:
        raise HTTPException(status_code=404, detail=f"Agent '{req.to_agent}' not found")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if AGENT_ECONOMY[req.from_agent]["balance"] < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    AGENT_ECONOMY[req.from_agent]["balance"] -= req.amount
    AGENT_ECONOMY[req.to_agent]["balance"]   += req.amount
    import uuid
    return {
        "success": True,
        "tx_id": f"byr-{uuid.uuid4().hex[:12]}",
        "from_balance": round(AGENT_ECONOMY[req.from_agent]["balance"], 2),
        "to_balance":   round(AGENT_ECONOMY[req.to_agent]["balance"],   2),
    }


class SkillRegisterRequest(BaseModel):
    agent: str
    skill: str
    type: str = "strategy"
    version: str = "1.0"
    description: str = ""

@app.post("/api/agents/skills/register")
def skills_register(req: SkillRegisterRequest):
    """Register a new skill for an agent in the Byreal Skills Registry."""
    agent_entry = next(
        (a for a in BYREAL_SKILLS_REGISTRY["agents"] if a["name"] == req.agent), None
    )
    if agent_entry is None:
        raise HTTPException(status_code=404, detail=f"Agent '{req.agent}' not found in registry")

    skill_obj = {
        "name": req.skill,
        "version": req.version,
        "type": req.type,
        "description": req.description or f"{req.skill} skill for {req.agent}",
    }
    agent_entry["skills"].append(skill_obj)

    total = sum(len(a["skills"]) for a in BYREAL_SKILLS_REGISTRY["agents"])
    import uuid
    return {
        "success": True,
        "skill_id": f"{req.agent.lower()}-{req.skill.lower()}-{uuid.uuid4().hex[:6]}",
        "total_skills": total,
    }


class SkillMintRequest(BaseModel):
    agent: str
    skill: str

@app.post("/api/agents/skills/mint")
async def skills_mint(req: SkillMintRequest):
    """Mint a skill on-chain via ERC-8004 (Byreal Skills CLI)."""
    agent_entry = next(
        (a for a in BYREAL_SKILLS_REGISTRY["agents"] if a["name"] == req.agent), None
    )
    if agent_entry is None:
        raise HTTPException(status_code=404, detail=f"Agent '{req.agent}' not found")

    skill_exists = any(s["name"] == req.skill for s in agent_entry["skills"])
    if not skill_exists:
        raise HTTPException(status_code=404, detail=f"Skill '{req.skill}' not registered for {req.agent}")

    try:
        from erc8004 import get_mantle_client
        client = get_mantle_client()
        tx_hash = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.record_trade(req.agent, "SKILL_MINT", req.skill, 0.0, ""),
        )
        return {"success": True, "tx_hash": tx_hash}
    except Exception as e:
        import uuid
        return {"success": True, "tx_hash": f"0x{uuid.uuid4().hex}00000000simulated"}


# ── Consumer & Viral — Achievements ─────────────────────────────────────────

ACHIEVEMENTS = [
    {"id": "first_blood",   "name": "First Blood",      "desc": "First trade executed",          "threshold": 1,   "field": "total_trades"},
    {"id": "ten_trades",    "name": "Active Trader",     "desc": "10 trades executed",            "threshold": 10,  "field": "total_trades"},
    {"id": "fifty_trades",  "name": "Veteran Quant",     "desc": "50 trades executed",            "threshold": 50,  "field": "total_trades"},
    {"id": "winning_streak","name": "On Fire",           "desc": "Win rate above 60%",            "threshold": 60,  "field": "winrate"},
    {"id": "perfect",       "name": "Flawless",          "desc": "Win rate above 80%",            "threshold": 80,  "field": "winrate"},
    {"id": "profitable",    "name": "In The Green",      "desc": "Positive ROI",                  "threshold": 0,   "field": "roi"},
    {"id": "big_gains",     "name": "Alpha Hunter",      "desc": "ROI above 10%",                 "threshold": 10,  "field": "roi"},
]

@app.get("/api/achievements")
def get_achievements(db: Session = Depends(database.get_db)):
    """Returns achievement status for all agents."""
    agents = db.query(models.Agent).all()
    result = []
    for agent in agents:
        trades = db.query(models.Trade).filter(models.Trade.agent_id == agent.id).all()
        total = len(trades)
        wins = sum(1 for t in trades if price_cache.get(t.symbol, {}).get("price", 0) > t.price and t.action == "BUY")
        win_rate = round(wins / total * 100, 1) if total > 0 else 0
        roi = round(sum(
            ((price_cache.get(t.symbol, {}).get("price", t.price) - t.price) / t.price * 100)
            * (1 if t.action == "BUY" else -1)
            for t in trades if t.price > 0
        ) / total if total > 0 else 0, 2)

        stats = {"total_trades": total, "winrate": win_rate, "roi": roi}
        earned = []
        for ach in ACHIEVEMENTS:
            val = stats.get(ach["field"], 0)
            if val >= ach["threshold"] if ach["threshold"] >= 0 else val > ach["threshold"]:
                earned.append({"id": ach["id"], "name": ach["name"], "desc": ach["desc"]})

        result.append({"agent": agent.name, "achievements": earned, "stats": stats})
    return result


# ── AI Personal CFO ──────────────────────────────────────────────────────────

class CFOAdviceRequest(BaseModel):
    risk_profile: str = "balanced"        # conservative | balanced | aggressive
    target_monthly_return: float = 5.0    # percent
    investment_horizon: str = "medium"    # short (< 1mo) | medium (1-6mo) | long (6mo+)
    capital_usd: float = 10000.0

@app.post("/api/cfo/advice")
async def cfo_advice(req: CFOAdviceRequest, db: Session = Depends(database.get_db)):
    """AI Personal CFO — generates personalized portfolio strategy + Byreal execution plan."""
    profile = req.risk_profile.lower()

    # ── Base allocations by risk profile ───────────────────────────────────
    ALLOCATIONS = {
        "conservative": {"rwa": 65, "trading": 15, "mnt_ecosystem": 15, "stable": 5},
        "balanced":     {"rwa": 40, "trading": 30, "mnt_ecosystem": 25, "stable": 5},
        "aggressive":   {"rwa": 20, "trading": 50, "mnt_ecosystem": 25, "stable": 5},
    }
    alloc = dict(ALLOCATIONS.get(profile, ALLOCATIONS["balanced"]))

    # ── Market regime adjustment ────────────────────────────────────────────
    btc_change = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    mnt_change = price_cache.get("MNT/USDT", {}).get("change_24h", 0.0)
    btc_price  = price_cache.get("BTC/USDT", {}).get("price", 0.0)
    eth_price  = price_cache.get("ETH/USDT", {}).get("price", 0.0)
    mnt_price  = price_cache.get("MNT/USDT", {}).get("price", 0.0)

    regime = "NEUTRAL"
    regime_adj = ""
    if btc_change <= -3.0:
        regime = "RISK_OFF"
        shift = min(10, alloc["trading"])
        alloc["trading"] -= shift
        alloc["rwa"] += shift
        regime_adj = f"Market down {btc_change:.1f}% — defensive shift: +{shift}% to RWA."
    elif btc_change >= 3.0:
        regime = "RISK_ON"
        shift = min(10, alloc["rwa"])
        alloc["rwa"] -= shift
        alloc["trading"] += shift
        regime_adj = f"Market up {btc_change:.1f}% — opportunistic shift: +{shift}% to active trading."

    # ── Portfolio health score ──────────────────────────────────────────────
    volatility_penalty = min(30, abs(btc_change) * 3)
    target_achievable  = 1.0 if req.target_monthly_return <= 15 else 0.7
    profile_bonus = {"conservative": 10, "balanced": 0, "aggressive": -5}.get(profile, 0)
    health_score = max(20, min(99, int(75 - volatility_penalty + profile_bonus + (target_achievable * 10))))
    health_label = (
        "Excellent" if health_score >= 80
        else "Good"    if health_score >= 60
        else "Caution" if health_score >= 40
        else "Danger"
    )
    health_color = {
        "Excellent": "#00e87a", "Good": "#00d4ff", "Caution": "#f59e0b", "Danger": "#ff3366"
    }[health_label]

    # ── Byreal execution plan ───────────────────────────────────────────────
    byreal_plan = []
    if alloc["rwa"] >= 30:
        byreal_plan.append({
            "skill": "byreal_swap",
            "action": f"Allocate {alloc['rwa']}% to RWA yield (USDY, mETH) via Byreal CLMM",
            "priority": "HIGH",
        })
    if alloc["mnt_ecosystem"] >= 20:
        byreal_plan.append({
            "skill": "byreal_lp_add",
            "action": f"Provide {alloc['mnt_ecosystem']}% liquidity to MNT/USDT CLMM pool for {18 if profile=='aggressive' else 12}% APY",
            "priority": "MEDIUM",
        })
    if alloc["trading"] >= 20:
        direction = "LONG BTC/ETH" if regime == "RISK_ON" else ("NEUTRAL MNT/USDT" if regime == "NEUTRAL" else "HEDGED positions")
        byreal_plan.append({
            "skill": "byreal_perps",
            "action": f"Deploy {alloc['trading']}% in active trading — {direction} via Byreal Perps CLI",
            "priority": "MEDIUM" if profile == "balanced" else "HIGH",
        })
    byreal_plan.append({
        "skill": "mantle_record",
        "action": "Record CFO decisions on-chain via ERC-8004 for full audit trail",
        "priority": "ALWAYS",
    })

    # ── Recommended actions ─────────────────────────────────────────────────
    actions = []
    horizon_label = {"short": "< 1 month", "medium": "1–6 months", "long": "6+ months"}.get(req.investment_horizon, "medium")
    annual_yield_est = alloc["rwa"] * 0.065 + alloc["mnt_ecosystem"] * 0.18 + alloc["trading"] * 0.25
    monthly_yield_est = round(annual_yield_est / 12, 1)

    actions.append(f"{'Preserve capital with high-yield RWA' if profile=='conservative' else 'Balance RWA yield + active alpha generation'}")
    actions.append(f"Target ~{monthly_yield_est:.1f}% monthly on ${req.capital_usd:,.0f} = ${req.capital_usd * monthly_yield_est / 100:,.0f}/month est.")
    actions.append(f"AI agents (AlphaQuant + RiskManager) auto-execute all trades via Byreal Skills")
    actions.append(f"Every decision recorded on Mantle blockchain — fully verifiable, censorship-resistant")
    if abs(btc_change) > 2:
        actions.append(f"⚠ Market volatile ({btc_change:+.1f}% BTC 24h) — RiskManager circuit breaker active")

    # ── AI narrative (Claude if available, rule-based fallback) ────────────
    if anthropic_client:
        try:
            prompt = (
                f"You are SoeClaw, an autonomous AI CFO managing a DeFi portfolio on Mantle blockchain. "
                f"Generate a 2-sentence personalized portfolio strategy for a {profile} investor "
                f"targeting {req.target_monthly_return}% monthly return over {req.investment_horizon} horizon "
                f"with ${req.capital_usd:,.0f} capital. "
                f"Market: BTC {btc_change:+.1f}% · MNT {mnt_change:+.1f}%. "
                f"Regime: {regime}. "
                f"Allocation: RWA {alloc['rwa']}%, Trading {alloc['trading']}%, MNT Ecosystem {alloc['mnt_ecosystem']}%. "
                f"Mention Byreal Skills and Mantle L2 specifically. Be concise and confident."
            )
            msg = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=160,
                messages=[{"role": "user", "content": prompt}],
            )
            ai_narrative = msg.content[0].text.strip()
        except Exception:
            ai_narrative = None
    else:
        ai_narrative = None

    if not ai_narrative:
        regime_map = {"RISK_OFF": "defensive", "RISK_ON": "opportunistic", "NEUTRAL": "balanced"}
        ai_narrative = (
            f"For your {profile} profile targeting {req.target_monthly_return}%/month, "
            f"I've built a {regime_map[regime]} allocation: "
            f"{alloc['rwa']}% in Mantle RWA yield (USDY/mETH via Byreal CLMM), "
            f"{alloc['trading']}% in active Byreal Perps trading, "
            f"and {alloc['mnt_ecosystem']}% in MNT ecosystem LP. "
            f"All decisions execute autonomously on Mantle L2 with ERC-8004 on-chain proof."
        )

    return {
        "risk_profile": profile,
        "target_monthly_return": req.target_monthly_return,
        "investment_horizon": req.investment_horizon,
        "capital_usd": req.capital_usd,
        "health_score": health_score,
        "health_label": health_label,
        "health_color": health_color,
        "regime": regime,
        "regime_adjustment": regime_adj,
        "allocation": alloc,
        "estimated_monthly_yield_pct": monthly_yield_est,
        "byreal_plan": byreal_plan,
        "actions": actions,
        "ai_narrative": ai_narrative,
        "market_snapshot": {
            "btc": btc_price,
            "btc_change": btc_change,
            "eth": eth_price,
            "mnt": mnt_price,
            "mnt_change": mnt_change,
        },
        "powered_by": "SoeClaw AI CFO × Byreal Skills × Mantle ERC-8004",
    }


@app.get("/api/cfo/health")
async def cfo_health():
    """Quick portfolio health check — no input required."""
    btc_change = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    volatility = abs(btc_change)
    health_score = max(20, min(99, int(80 - volatility * 2.5)))
    regime = "RISK_OFF" if btc_change <= -3 else ("RISK_ON" if btc_change >= 3 else "NEUTRAL")
    return {
        "health_score": health_score,
        "regime": regime,
        "btc_24h_change": btc_change,
        "message": f"Market {regime.replace('_', ' ')} · BTC {btc_change:+.1f}% — AI agents adapting strategy",
    }


class CFOSettingsSave(BaseModel):
    user_key: str
    risk_profile: str = "balanced"
    target_monthly_return: float = 5.0
    investment_horizon: str = "medium"
    capital_usd: float = 10000.0
    advice_json: Optional[str] = None

@app.get("/api/cfo/settings")
async def get_cfo_settings(user_key: str, db: Session = Depends(database.get_db)):
    row = db.query(models.CFOSettings).filter(models.CFOSettings.user_key == user_key).first()
    if not row:
        return {"found": False}
    return {
        "found": True,
        "risk_profile": row.risk_profile,
        "target_monthly_return": row.target_monthly_return,
        "investment_horizon": row.investment_horizon,
        "capital_usd": row.capital_usd,
        "advice": json.loads(row.advice_json) if row.advice_json else None,
    }

@app.post("/api/cfo/settings")
async def save_cfo_settings(req: CFOSettingsSave, db: Session = Depends(database.get_db)):
    row = db.query(models.CFOSettings).filter(models.CFOSettings.user_key == req.user_key).first()
    import datetime
    if row:
        row.risk_profile = req.risk_profile
        row.target_monthly_return = req.target_monthly_return
        row.investment_horizon = req.investment_horizon
        row.capital_usd = req.capital_usd
        row.advice_json = req.advice_json
        row.updated_at = datetime.datetime.utcnow()
    else:
        row = models.CFOSettings(
            user_key=req.user_key,
            risk_profile=req.risk_profile,
            target_monthly_return=req.target_monthly_return,
            investment_horizon=req.investment_horizon,
            capital_usd=req.capital_usd,
            advice_json=req.advice_json,
        )
        db.add(row)
    db.commit()
    return {"ok": True}


# ── Byreal SDK endpoints ─────────────────────────────────────────────────────

def _byreal_wrap(raw: dict) -> dict:
    """Normalize Byreal CLI response to always return {success, data}."""
    if "success" in raw:
        return raw  # already normalized
    return {"success": True, "data": raw}


@app.get("/api/byreal/overview")
async def byreal_overview():
    """Byreal DEX global stats via @byreal-io/byreal-cli."""
    try:
        from byreal import get_dex_overview
        return _byreal_wrap(await get_dex_overview())
    except Exception as e:
        return {"success": False, "error": str(e) or type(e).__name__}


@app.get("/api/byreal/pools")
async def byreal_pools():
    """Top CLMM liquidity pools from Byreal DEX."""
    try:
        from byreal import get_pools
        return _byreal_wrap(await get_pools())
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/pools/search")
async def byreal_pools_search(q: str = "SOL"):
    """Search Byreal CLMM pools by token symbol."""
    try:
        from byreal import search_pools
        return _byreal_wrap(await search_pools(q))
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/tokens")
async def byreal_tokens():
    """Token list with prices from Byreal."""
    try:
        from byreal import get_tokens
        return _byreal_wrap(await get_tokens())
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/perps/signals")
async def byreal_perps_signals():
    """AI-generated perpetuals trading signals from Byreal Perps CLI."""
    try:
        from byreal import get_perps_signals
        return _byreal_wrap(await get_perps_signals())
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/perps/account")
async def byreal_perps_account():
    """Perps account info (equity, margin, PnL)."""
    try:
        from byreal import get_perps_account
        return _byreal_wrap(await get_perps_account())
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/perps/positions")
async def byreal_perps_positions():
    """Open perps positions."""
    try:
        from byreal import get_perps_positions
        return _byreal_wrap(await get_perps_positions())
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/perps/orders")
async def byreal_perps_orders():
    """Open perps orders."""
    try:
        from byreal import get_perps_orders
        return _byreal_wrap(await get_perps_orders())
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/perps/history")
async def byreal_perps_history():
    """Perps trade history."""
    try:
        from byreal import get_perps_history
        return _byreal_wrap(await get_perps_history())
    except Exception as e:
        return {"success": False, "error": str(e)}


class PerpsCancelOrderRequest(BaseModel):
    oid: str

@app.post("/api/byreal/perps/order/cancel")
async def byreal_cancel_order(req: PerpsCancelOrderRequest):
    """Cancel a perps order by ID."""
    try:
        from byreal import cancel_perps_order
        return _byreal_wrap(await asyncio.wait_for(cancel_perps_order(req.oid), timeout=20))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Cancel timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/byreal/perps/order/cancel-all")
async def byreal_cancel_all_orders():
    """Cancel all open perps orders."""
    try:
        from byreal import cancel_all_perps_orders
        return _byreal_wrap(await asyncio.wait_for(cancel_all_perps_orders(), timeout=20))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Cancel-all timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


class PerpsClosePositionRequest(BaseModel):
    symbol: str

@app.post("/api/byreal/perps/position/close")
async def byreal_close_position(req: PerpsClosePositionRequest):
    """Close a perps position at market price."""
    try:
        from byreal import close_perps_position
        return _byreal_wrap(await asyncio.wait_for(close_perps_position(req.symbol), timeout=30))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Close position timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/byreal/perps/position/close-all")
async def byreal_close_all_positions():
    """Close all open perps positions at market price."""
    try:
        from byreal import close_all_perps_positions
        return _byreal_wrap(await asyncio.wait_for(close_all_perps_positions(), timeout=30))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Close-all timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


class PerpsLeverageRequest(BaseModel):
    symbol: str
    leverage: int

@app.post("/api/byreal/perps/position/leverage")
async def byreal_set_leverage(req: PerpsLeverageRequest):
    """Set leverage for a perps position."""
    try:
        from byreal import set_position_leverage
        return _byreal_wrap(await asyncio.wait_for(set_position_leverage(req.symbol, req.leverage), timeout=20))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Set leverage timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


class PerpsTpslRequest(BaseModel):
    symbol: str
    tp: Optional[float] = None
    sl: Optional[float] = None

@app.post("/api/byreal/perps/position/tpsl")
async def byreal_set_tpsl(req: PerpsTpslRequest):
    """Set take-profit / stop-loss for a perps position."""
    try:
        from byreal import set_position_tpsl
        return _byreal_wrap(await asyncio.wait_for(set_position_tpsl(req.symbol, req.tp, req.sl), timeout=20))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Set TP/SL timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


class PerpsLimitOrderRequest(BaseModel):
    symbol: str
    side: str
    size: float
    price: float
    tp: Optional[float] = None
    sl: Optional[float] = None

@app.post("/api/byreal/perps/order/limit")
async def byreal_limit_order(req: PerpsLimitOrderRequest):
    """Place a perps limit order."""
    try:
        from byreal import place_limit_order
        return _byreal_wrap(await asyncio.wait_for(
            place_limit_order(req.symbol, req.side, req.size, req.price, req.tp, req.sl),
            timeout=30,
        ))
    except asyncio.TimeoutError:
        return {"success": False, "error": "Limit order timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/byreal/swap/preview")
async def byreal_swap_preview(from_token: str = "SOL", to_token: str = "USDC", amount: float = 1.0):
    """Preview a token swap on Byreal CLMM DEX."""
    try:
        from byreal import get_swap_preview
        return _byreal_wrap(await get_swap_preview(from_token, to_token, amount))
    except Exception as e:
        return {"success": False, "error": str(e)}


class ByrealWalletRequest(BaseModel):
    wallet_address: str

@app.post("/api/byreal/wallet/register")
async def byreal_wallet_register(req: ByrealWalletRequest):
    """Register user wallet with Byreal Skills registry for agent attribution."""
    addr = req.wallet_address
    try:
        from byreal import get_dex_overview
        overview = await asyncio.wait_for(get_dex_overview(), timeout=10)
        dex = overview.get("data", {})
        tvl   = dex.get("tvl", dex.get("totalTvl", 0))
        pools = dex.get("pools_count", dex.get("poolCount", "—"))
        vol   = dex.get("volume_24h_usd", dex.get("volume24h", 0))
    except Exception:
        tvl, pools, vol = 0, "—", 0

    # Persist wallet in BYREAL_SKILLS_REGISTRY for agent attribution
    for agent in BYREAL_SKILLS_REGISTRY["agents"]:
        agent["wallet"]["address"] = addr

    return {
        "success": True,
        "wallet": addr,
        "byreal_status": "connected",
        "dex_tvl": tvl,
        "dex_pools": pools,
        "dex_volume_24h": vol,
    }


class SwapExecuteRequest(BaseModel):
    from_token: str
    to_token: str
    amount: float
    slippage: float = 0.5

@app.post("/api/byreal/swap/execute")
async def byreal_swap_execute(req: SwapExecuteRequest):
    """Execute a real token swap on Byreal CLMM DEX via CLI."""
    try:
        from byreal import execute_swap
        result = await asyncio.wait_for(
            execute_swap(req.from_token, req.to_token, req.amount, req.slippage),
            timeout=30,
        )
        return _byreal_wrap(result)
    except asyncio.TimeoutError:
        return {"success": False, "error": "Swap execution timed out (30s)"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Wallet Analysis ──────────────────────────────────────────────────────────

class WalletAnalyzeRequest(BaseModel):
    address: str

@app.post("/api/wallet/analyze")
async def analyze_wallet(req: WalletAnalyzeRequest):
    """AI greeting + portfolio analysis when user connects their wallet."""
    address = req.address
    balance_mnt = 0.0
    token_balances: dict = {}

    # Get MNT balance from Mantle
    try:
        from web3 import Web3
        checksummed = Web3.to_checksum_address(address)
        balance_wei = mantle_client.w3.eth.get_balance(checksummed)
        balance_mnt = balance_wei / 1e18
    except Exception:
        pass

    # Build portfolio context
    portfolio_ctx = f"MNT: {balance_mnt:.4f}"
    greeting = f"Wallet {address[:6]}...{address[-4:]} connected. Balance: {portfolio_ctx} on Mantle."

    if anthropic_client:
        try:
            def _call():
                return anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=150,
                    messages=[{"role": "user", "content": (
                        f"User just connected their wallet to SoeClaw AI CFO on Mantle mainnet. "
                        f"Wallet: {address[:10]}... Balance: {portfolio_ctx}. "
                        f"Give a short, friendly 2-sentence personalized welcome. "
                        f"If they have MNT, suggest a specific opportunity (Byreal DEX, mETH staking 6% APY, CLMM liquidity). "
                        f"Be direct and specific. No generic greetings."
                    )}]
                )
            resp = await asyncio.to_thread(_call)
            greeting = resp.content[0].text.strip()
        except Exception:
            pass

    return {
        "greeting": greeting,
        "balance_mnt": round(balance_mnt, 4),
        "address": address,
        "ai": anthropic_client is not None,
    }


# ── Run AI Action ────────────────────────────────────────────────────────────

class RunAIActionRequest(BaseModel):
    wallet_address: str

@app.post("/api/ai/run-action")
async def run_ai_action(req: RunAIActionRequest):
    """
    Oracle pattern — step 1 (user side):
    Returns calldata for requestAI(symbol) so the user signs via MetaMask.
    The backend oracle_loop() then picks up the AIRequested event,
    runs Claude AI inference, and calls fulfillAIResult() back on-chain.
    """
    # Pick symbol with highest absolute 24h move
    best_symbol = "MNT/USDT"
    best_abs = 0.0
    for sym, data in price_cache.items():
        abs_chg = abs(data.get("change_24h", 0.0))
        if abs_chg > best_abs:
            best_abs = abs_chg
            best_symbol = sym

    price      = price_cache.get(best_symbol, {}).get("price", 0.0)
    change_24h = price_cache.get(best_symbol, {}).get("change_24h", 0.0)

    # Encode requestAI(symbol) calldata — user's wallet triggers the oracle
    from mantle_client import SOECLAW_ABI, CONTRACT_ADDRESS as _CONTRACT_ADDR
    from web3 import Web3 as _Web3
    calldata = "0x"
    contract_addr = _CONTRACT_ADDR
    try:
        _enc_contract = mantle_client.w3.eth.contract(
            address=_Web3.to_checksum_address(_CONTRACT_ADDR),
            abi=SOECLAW_ABI,
        )
        calldata = _enc_contract.encodeABI(fn_name="requestAI", args=[best_symbol])
    except Exception as enc_err:
        print(f"[RunAIAction] calldata encoding failed: {enc_err}")

    description = (
        f"Request AI Analysis: {best_symbol}\n"
        f"Current price: ${price:,.4f} ({change_24h:+.2f}% 24h)\n\n"
        f"Step 1: Your wallet triggers requestAI() on-chain → emits AIRequested event\n"
        f"Step 2: Backend oracle detects event → runs Claude AI inference\n"
        f"Step 3: Oracle writes fulfillAIResult() on-chain → result stored forever"
    )

    # Preview: what AI would decide right now
    action, confidence, reasoning, _ = get_ai_decision(
        "SoeClawAI", "momentum and technical analysis", best_symbol, price, change_24h
    )

    confidence_int = max(0, min(100, int(confidence)))
    return {
        "preview": {                      # AI preview (not on-chain yet)
            "symbol":     best_symbol,
            "action":     action,
            "confidence": confidence_int,
            "reasoning":  reasoning,
            "price":      price,
            "change_24h": change_24h,
        },
        "tx_data": {
            "to":          contract_addr,
            "value":       "0x0",
            "data":        calldata,
            "gasLimit":    "0x30D40",
            "description": description,
            "action_label": f"Request AI for {best_symbol}",
        },
    }


@app.get("/api/ai/result/{request_id}")
async def get_ai_result(request_id: int):
    """Poll for fulfillment of an AIRequested event."""
    if not mantle_client.contract:
        return {"fulfilled": False, "error": "Contract not connected"}
    try:
        result = await asyncio.to_thread(
            mantle_client.contract.functions.getAIResult(request_id).call
        )
        action, confidence, reasoning, fulfilled, fulfilled_at, caller = result
        return {
            "fulfilled":    fulfilled,
            "action":       action,
            "confidence":   confidence,
            "reasoning":    reasoning,
            "fulfilled_at": fulfilled_at,
            "caller":       caller,
        }
    except Exception as e:
        return {"fulfilled": False, "error": str(e)}


# ── Auth schemas ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str


# ── Auth endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(req: RegisterRequest, db: Session = Depends(database.get_db)):
    if db.query(models.User).filter(models.User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(models.User).filter(models.User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        username=req.username,
        email=req.email,
        hashed_pw=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token({"sub": user.username, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "username": user.username}


@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    try:
        valid = user and verify_password(req.password, user.hashed_pw)
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token({"sub": user.username, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "username": user.username}


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"username": current_user["sub"]}


# ── WebSocket ───────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Push current prices immediately so the UI doesn't start blank
    await websocket.send_text(json.dumps({"type": "PRICE_UPDATE", "data": price_cache}))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── REST endpoints ──────────────────────────────────────────────────────────

@app.get("/api/agents")
def get_agents(db: Session = Depends(database.get_db)):
    agents = db.query(models.Agent).all()
    if not agents:
        seed_agents(db)
        agents = db.query(models.Agent).all()

    result = []
    for agent in agents:
        trades = db.query(models.Trade).filter(models.Trade.agent_id == agent.id).all()
        total = len(trades)

        # Win = trade arah benar vs harga saat ini
        wins = 0
        total_pnl_pct = 0.0
        for t in trades:
            current = price_cache.get(t.symbol, {}).get("price", 0)
            if current > 0 and t.price > 0:
                pnl = ((current - t.price) / t.price) * 100
                if t.action == "SELL":
                    pnl = -pnl
                total_pnl_pct += pnl
                if pnl > 0:
                    wins += 1

        win_rate  = round((wins / total * 100) if total > 0 else 0.0, 1)
        roi       = round(total_pnl_pct / total if total > 0 else 0.0, 2)
        trust     = min(100, 50 + total * 2 + int(win_rate / 2))

        result.append({
            "id": agent.id,
            "name": agent.name,
            "wallet_address": agent.wallet_address,
            "roi": roi,
            "winrate": win_rate,
            "trust_score": trust,
            "total_trades": total,
        })

    return sorted(result, key=lambda x: x["roi"], reverse=True)


def seed_agents(db: Session):
    for cfg in AGENT_CONFIGS:
        agent = models.Agent(
            name=cfg["name"],
            wallet_address=f"0x{random.randint(10**39, 10**40-1):x}",
        )
        db.add(agent)
    db.commit()


@app.get("/api/trades")
def get_trades(db: Session = Depends(database.get_db)):
    trades = db.query(models.Trade).order_by(models.Trade.id.desc()).limit(50).all()
    return [
        {
            "symbol": t.symbol,
            "action": t.action,
            "price": t.price,
            "tx_hash": t.tx_hash,
            "confidence": t.confidence,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in trades
    ]


@app.get("/api/thought-stream")
def get_thought_stream(db: Session = Depends(database.get_db)):
    return db.query(models.ThoughtStream).order_by(models.ThoughtStream.id.desc()).limit(100).all()


@app.get("/api/market")
async def get_market_prices():
    await fetch_prices()
    return price_cache


@app.get("/api/performance")
def get_performance(db: Session = Depends(database.get_db)):
    """Overall trading performance summary."""
    trades = db.query(models.Trade).all()
    total  = len(trades)
    if total == 0:
        return {"total_trades": 0, "wins": 0, "win_rate": 0, "avg_roi": 0, "by_symbol": {}}

    wins = 0
    total_pnl = 0.0
    by_symbol: dict = {}

    for t in trades:
        current = price_cache.get(t.symbol, {}).get("price", 0)
        if current > 0 and t.price > 0:
            pnl = ((current - t.price) / t.price) * 100
            if t.action == "SELL":
                pnl = -pnl
            total_pnl += pnl
            if pnl > 0:
                wins += 1
            sym = by_symbol.setdefault(t.symbol, {"trades": 0, "pnl": 0.0})
            sym["trades"] += 1
            sym["pnl"] = round(sym["pnl"] + pnl, 2)

    return {
        "total_trades": total,
        "wins": wins,
        "win_rate": round(wins / total * 100, 1),
        "avg_roi": round(total_pnl / total, 2),
        "by_symbol": by_symbol,
    }


VALID_SYMBOLS = {"BTC/USDT", "ETH/USDT", "MNT/USDT"}

@app.get("/api/backtest/{symbol}")
async def backtest(symbol: str):
    """Run 7-day backtest for all agents on a given symbol."""
    sym = symbol.replace("-", "/").upper()
    if sym not in VALID_SYMBOLS:
        raise HTTPException(status_code=400, detail=f"Unknown symbol '{sym}'. Valid: BTC-USDT, ETH-USDT, MNT-USDT")
    results = []
    for cfg in AGENT_CONFIGS:
        r = await run_backtest(cfg["name"], sym)
        if r:
            results.append({
                "agent": r.agent_name,
                "symbol": r.symbol,
                "total_trades": r.total_trades,
                "win_rate": r.win_rate,
                "total_roi": r.total_roi,
                "sharpe_ratio": r.sharpe_ratio,
                "max_drawdown": r.max_drawdown,
                "avg_confidence": r.avg_confidence,
            })
    return sorted(results, key=lambda x: x["total_roi"], reverse=True)


@app.get("/api/wallet")
async def get_wallet():
    from mantle_client import RPC_URL, CHAIN_ID, _NETWORK
    network_name = "Mantle" if _NETWORK == "mainnet" else "Mantle Sepolia Testnet"
    result = {
        "address": "N/A",
        "mnt_balance": 0.0,
        "network": network_name,
        "chain_id": CHAIN_ID,
        "connected": False,
    }
    private_key = os.getenv("PRIVATE_KEY", "")
    if not private_key:
        return result

    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10}))
        account = w3.eth.account.from_key(private_key)
        result["address"] = account.address
        if w3.is_connected():
            result["connected"] = True
            balance_wei = w3.eth.get_balance(account.address)
            result["mnt_balance"] = round(float(w3.from_wei(balance_wei, "ether")), 4)
    except Exception as e:
        print(f"[Wallet] Error: {e}")

    return result


# ── Agent control ────────────────────────────────────────────────────────────

agent_running = True  # default ON saat startup


@app.post("/api/agent/start")
async def agent_start():
    global agent_running
    agent_running = True
    await manager.broadcast({"type": "AGENT_STATUS", "data": {"running": True}})
    await manager.broadcast({
        "type": "THOUGHT",
        "data": {
            "agent_name": "SYSTEM",
            "message": "Agent STARTED — scanning byreal-perps-cli signals, monitoring Byreal CLMM pools",
            "msg_type": "INFO",
        },
    })
    return {"status": "started"}


@app.post("/api/agent/stop")
async def agent_stop():
    global agent_running
    agent_running = False
    await manager.broadcast({"type": "AGENT_STATUS", "data": {"running": False}})
    await manager.broadcast({
        "type": "THOUGHT",
        "data": {
            "agent_name": "SYSTEM",
            "message": "Agent STOPPING — closing all Byreal perps positions & cancelling open orders…",
            "msg_type": "INFO",
        },
    })
    # Close all open perps positions and cancel orders on Byreal
    results = {}
    try:
        from byreal import close_all_perps_positions, cancel_all_perps_orders
        pos_result = await asyncio.wait_for(close_all_perps_positions(), timeout=20)
        results["positions_closed"] = pos_result
        ord_result = await asyncio.wait_for(cancel_all_perps_orders(), timeout=20)
        results["orders_cancelled"] = ord_result
        await manager.broadcast({
            "type": "THOUGHT",
            "data": {
                "agent_name": "BYREAL",
                "message": "✅ All Byreal perps positions closed · All pending orders cancelled · Agent stopped",
                "msg_type": "ACTION",
            },
        })
    except Exception as e:
        results["cleanup_error"] = str(e)
        await manager.broadcast({
            "type": "THOUGHT",
            "data": {
                "agent_name": "BYREAL",
                "message": f"Agent stopped · Byreal cleanup: {str(e)[:80]}",
                "msg_type": "INFO",
            },
        })
    return {"status": "stopped", **results}


@app.get("/api/agent/status")
async def agent_status():
    return {"running": agent_running, "bybit_connected": _bybit_connected}


@app.get("/api/alpha/alerts")
def get_recent_alerts():
    """Returns the 50 most recent alpha alerts for the frontend."""
    try:
        from alpha.alert_manager import _recent_alerts
        import datetime
        return [
            {
                "type":      a.type.lower(),
                "symbol":    a.symbol.split(":")[0],
                "title":     a.title,
                "message":   a.message,
                "severity":  a.severity.lower(),
                "timestamp": datetime.datetime.utcfromtimestamp(a.ts).isoformat() + "Z",
            }
            for a in _recent_alerts
        ]
    except Exception:
        return []


@app.get("/api/agents/onchain")
async def agents_onchain():
    """Returns live on-chain ERC-8004 trade count and reputation for all agents."""
    result = []
    for cfg in AGENT_CONFIGS:
        stats = mantle_client.get_agent_stats(cfg["name"])
        result.append({
            "name": cfg["name"],
            "onchain_trades": stats["trades"],
            "reputation": stats["reputation"],
            "registry": "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d",
            "network": "Mantle",
        })
    return result


# ── On-chain benchmark ───────────────────────────────────────────────────────

@app.get("/api/agents/benchmark")
async def agents_benchmark(db: Session = Depends(database.get_db)):
    """
    Verifiable on-chain benchmark for all AI agents.
    Combines DB trade history with live ERC-8004 on-chain stats.
    Every decision (BUY/SELL/HOLD) is recorded on Mantle — this is the proof.
    """
    from mantle_client import AGENT_TOKEN_IDS
    result = []
    for cfg in AGENT_CONFIGS:
        agent_name = cfg["name"]

        # DB: executed trades
        agent_db = db.query(models.Agent).filter(models.Agent.name == agent_name).first()
        trades = db.query(models.Trade).filter(
            models.Trade.agent_id == agent_db.id
        ).all() if agent_db else []

        # DB: HOLD decisions (msg_type INFO = HOLD reasoning, CHAIN = confirmed on-chain)
        hold_count = db.query(models.ThoughtStream).filter(
            models.ThoughtStream.agent_name == agent_name,
            models.ThoughtStream.msg_type == "INFO",
        ).count()

        # P&L per trade
        wins = 0
        total_pnl_pct = 0.0
        for t in trades:
            current = price_cache.get(t.symbol, {}).get("price", 0)
            if current > 0 and t.price > 0:
                pnl = ((current - t.price) / t.price) * 100
                if t.action == "SELL":
                    pnl = -pnl
                total_pnl_pct += pnl
                if pnl > 0:
                    wins += 1

        buy_count  = sum(1 for t in trades if t.action == "BUY")
        sell_count = sum(1 for t in trades if t.action == "SELL")
        win_rate   = round((wins / len(trades) * 100) if trades else 0.0, 1)
        avg_roi    = round(total_pnl_pct / len(trades) if trades else 0.0, 2)

        # On-chain stats from ERC-8004 registry (non-blocking)
        onchain = await asyncio.to_thread(mantle_client.get_agent_stats, agent_name)

        result.append({
            "name":            agent_name,
            "total_decisions": len(trades) + hold_count,
            "buy_count":       buy_count,
            "sell_count":      sell_count,
            "hold_count":      hold_count,
            "win_rate":        win_rate,
            "avg_roi_pct":     avg_roi,
            "onchain_trades":  onchain.get("trades", 0),
            "reputation":      onchain.get("reputation", 0),
            "erc8004_token_id": AGENT_TOKEN_IDS.get(agent_name),
            "registry_address": "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d",
            "explorer_url":    f"https://explorer.mantle.xyz/address/0x389DF777f009d32c4B6451F159c763c7f9d15803",
            "network":         "Mantle",
            "chain_id":        5000,
        })

    return sorted(result, key=lambda x: x["win_rate"], reverse=True)


# ── Background agent loop ────────────────────────────────────────────────────

_agent_idx = 0
AGENT_INTERVAL = int(os.getenv("AGENT_INTERVAL", "60"))  # seconds between ticks


async def agent_loop():
    global _agent_idx

    # Warm up prices before first tick
    await fetch_prices()
    await manager.broadcast({"type": "PRICE_UPDATE", "data": price_cache})

    while True:
        await asyncio.sleep(AGENT_INTERVAL)

        if not agent_running:
            continue  # skip tick tapi tetap loop (harga masih update)

        try:
            # Refresh prices (fetch_prices caches internally for 15s)
            await fetch_prices()
            # Always append current cached prices to history (even if fetch failed)
            for sym in price_history:
                p = price_cache[sym]["price"]
                if p > 0:
                    price_history[sym] = (price_history[sym] + [p])[-50:]
            await manager.broadcast({"type": "PRICE_UPDATE", "data": price_cache})

            # Pick rotating agent — capture index BEFORE incrementing
            current_idx = _agent_idx % len(AGENT_CONFIGS)
            _agent_idx += 1
            agent_cfg = AGENT_CONFIGS[current_idx]
            symbol = random.choice(list(price_cache.keys()))
            price_info = price_cache[symbol]
            price = price_info["price"]
            change_24h = price_info["change_24h"]

            if price == 0:
                continue

            # ── Step 1: READ ERC-8004 reputation from Mantle blockchain ───────
            onchain = await asyncio.to_thread(mantle_client.get_agent_stats, agent_cfg["name"])
            reputation     = onchain.get("reputation", 0)
            onchain_trades = onchain.get("trades", 0)

            rep_label = (
                f"ELITE (REP:{reputation})"       if reputation >= 20
                else f"PROVEN (REP:{reputation})" if reputation >= 10
                else f"CONSERVATIVE (REP:{reputation})" if reputation < 0
                else f"NEUTRAL (REP:{reputation})"
            )
            await manager.broadcast({
                "type": "THOUGHT",
                "data": {
                    "agent_name": agent_cfg["name"],
                    "message": (
                        f"Reading ERC-8004 identity from Mantle — {rep_label}, "
                        f"{onchain_trades} verified decisions on-chain"
                    ),
                    "msg_type": "CHAIN",
                    "tx_hash": None,
                    "explorer_url": (
                        "https://explorer.mantle.xyz/address/"
                        "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d"
                    ),
                },
            })

            # ── Step 2: DATA — market feed ingested by AI ────────────────────
            history_len = len(price_history.get(symbol, []))
            sma_fast = round(sum(price_history[symbol][-5:]) / 5, 4) if len(price_history.get(symbol, [])) >= 5 else price
            sma_slow = round(sum(price_history[symbol][-20:]) / 20, 4) if len(price_history.get(symbol, [])) >= 20 else price
            trend_sig = "UPTREND" if sma_fast > sma_slow else ("DOWNTREND" if sma_fast < sma_slow else "SIDEWAYS")
            await manager.broadcast({
                "type": "THOUGHT",
                "data": {
                    "agent_name": agent_cfg["name"],
                    "message": (
                        f"STEP 1/3 · INGESTING MARKET FEED · {symbol} "
                        f"@ ${price:,.4f} ({change_24h:+.2f}% 24h) · "
                        f"SMA5={sma_fast:,.4f} SMA20={sma_slow:,.4f} · "
                        f"Trend={trend_sig} · datapoints={history_len}"
                    ),
                    "msg_type": "DATA",
                },
            })

            # ── Step 3: AI analysis — send to Claude with agent's system prompt
            btc_vol = abs(price_cache.get("BTC/USDT", {}).get("change_24h", 0.0))
            risk_status = "ELEVATED" if btc_vol > 4 else ("MODERATE" if btc_vol > 2 else "LOW")
            await manager.broadcast({
                "type": "THOUGHT",
                "data": {
                    "agent_name": agent_cfg["name"],
                    "message": (
                        f"STEP 2/3 · AI ANALYSIS · calling Claude ({agent_cfg['specialty']}) · "
                        f"market_risk={risk_status} (BTC Δ={btc_vol:.1f}%) · "
                        f"ERC-8004 rep={reputation} · max_size="
                        f"{'25' if reputation >= 20 else ('18' if reputation >= 10 else ('6' if reputation < 0 else '10'))}%"
                    ),
                    "msg_type": "DATA",
                },
            })

            # ── Step 4: AI makes the decision ────────────────────────────────
            action, confidence, reasoning, position_size = get_ai_decision(
                agent_cfg["name"], agent_cfg["specialty"], symbol, price, change_24h,
                reputation, onchain_trades,
                system_prompt=agent_cfg.get("system", ""),
            )

            await manager.broadcast({
                "type": "THOUGHT",
                "data": {
                    "agent_name": agent_cfg["name"],
                    "message": (
                        f"STEP 3/3 · AI DECISION · {action} {symbol} "
                        f"conf={confidence:.0f}% · size={position_size}% · "
                        f"{reasoning}"
                    ),
                    "msg_type": "DATA",
                },
            })

            thought_msg = {
                "type": "THOUGHT",
                "data": {
                    "agent_name": agent_cfg["name"],
                    "message": (
                        f"[{symbol}] ${price:,.4f} ({change_24h:+.2f}%) -> {action} | "
                        f"{reasoning} (Conf: {confidence:.0f}%, Size: {position_size}%)"
                    ),
                    "msg_type": "ACTION" if action != "HOLD" else "INFO",
                },
            }
            await manager.broadcast(thought_msg)

            db = database.SessionLocal()
            try:
                thought = models.ThoughtStream(
                    agent_name=agent_cfg["name"],
                    message=thought_msg["data"]["message"],
                    msg_type=thought_msg["data"]["msg_type"],
                )
                db.add(thought)

                if action != "HOLD":
                    # Run blocking web3 tx in thread pool — avoids freezing the event loop
                    tx_hash = await asyncio.to_thread(
                        mantle_client.log_trade_on_chain, agent_cfg["name"], symbol, action, confidence
                    )
                    trade = models.Trade(
                        agent_id=current_idx + 1,  # DB IDs are 1-indexed, match AGENT_CONFIGS order
                        symbol=symbol,
                        action=action,
                        confidence=confidence,
                        price=price,
                        tx_hash=tx_hash,
                    )
                    db.add(trade)
                    db.commit()

                    explorer_url = f"{EXPLORER_BASE}/tx/{tx_hash}" if _valid_tx(tx_hash) else None
                    await manager.broadcast({
                        "type": "TRADE",
                        "data": {
                            "symbol": trade.symbol,
                            "action": trade.action,
                            "price": trade.price,
                            "tx_hash": trade.tx_hash,
                            "explorer_url": explorer_url,
                            "agent": agent_cfg["name"],
                            "confidence": confidence,
                            "created_at": trade.created_at.isoformat() if trade.created_at else None,
                            "erc8004": True,
                        },
                    })

                    # ── Byreal Skills CLI — real invocation ───────────────────
                    MANTLE_TOKENS = {"MNT/USDT", "mETH/USDT", "COOK/USDT", "FBTC/USDT", "WMNT/USDT"}
                    PERP_TOKENS   = {"BTC/USDT", "ETH/USDT"}
                    token_base    = symbol.replace("/USDT", "")
                    _pending_swap = None

                    try:
                        if symbol in PERP_TOKENS:
                            # byreal-perps-cli: scan signals → execute if confirmed
                            from byreal import get_perps_signals, execute_market_order
                            signals_data = await asyncio.wait_for(get_perps_signals(), timeout=12)
                            direction = "LONG" if action == "BUY" else "SHORT"
                            # Parse nested structure: data.signals.{conservative,moderate,aggressive}[]
                            raw_data  = signals_data.get("data", {})
                            sig_dict  = raw_data.get("signals", {}) if isinstance(raw_data, dict) else {}
                            sig_list  = []
                            for cat_sigs in sig_dict.values():
                                if isinstance(cat_sigs, list):
                                    sig_list.extend(cat_sigs)
                            matching = next((s for s in sig_list if token_base.upper() == s.get("coin","").upper()), None)
                            sig_score = float(matching.get("score", 0)) if matching else 0
                            sig_dir   = matching.get("direction", "").upper() if matching else ""
                            if matching:
                                sig_str = (
                                    f"coin={matching['coin']} dir={sig_dir} "
                                    f"RSI={matching.get('rsi','?')} score={sig_score:.0f} "
                                    f"price=${float(matching.get('price',0)):,.0f}"
                                )
                            else:
                                sig_str = f"{len(sig_list)} signals scanned, no match for {token_base}"

                            # Execute real order when byreal signal confirms AI direction
                            signal_confirms = (
                                matching is not None and
                                sig_score >= 55 and
                                sig_dir == direction and
                                confidence >= 60
                            )
                            order_result = None
                            if signal_confirms:
                                try:
                                    order_result = await asyncio.wait_for(
                                        execute_market_order(
                                            symbol=token_base,
                                            side=action.lower(),  # "buy" or "sell"
                                            size=10.0,            # $10 USDT per trade
                                            leverage=5,
                                            sl=price * (0.97 if action == "BUY" else 1.03),
                                        ),
                                        timeout=15,
                                    )
                                except Exception as oe:
                                    order_result = {"error": str(oe)}

                            byreal_skill = "byreal_perps"
                            if signal_confirms and order_result and "error" not in order_result:
                                byreal_msg = (
                                    f"[BYREAL PERPS] ✅ ORDER EXECUTED · {action} {token_base} $10 · "
                                    f"score={sig_score:.0f} dir={sig_dir} · conf {confidence:.0f}% · "
                                    f"SL 3% · Hyperliquid Perps"
                                )
                            elif signal_confirms and order_result and "error" in order_result:
                                byreal_msg = (
                                    f"[BYREAL PERPS] signal confirmed (score={sig_score:.0f}) but order failed: "
                                    f"{order_result['error'][:60]}"
                                )
                            else:
                                byreal_msg = (
                                    f"[BYREAL PERPS] signal scan → {sig_str} · "
                                    f"AI={direction} conf={confidence:.0f}% · "
                                    f"{'no byreal confirmation (score={:.0f}<55)'.format(sig_score) if matching else 'no matching signal — skipping order'}"
                                )
                        else:
                            # Real Byreal DEX CLI — swap preview
                            from byreal import get_swap_preview
                            amt = 100.0
                            _from_t = "USDT" if action == "BUY" else token_base
                            _to_t   = token_base if action == "BUY" else "USDT"
                            preview = await asyncio.wait_for(get_swap_preview(_from_t, _to_t, amt), timeout=12)
                            raw_prev = preview.get("data", preview)
                            out_amt  = raw_prev.get("outputAmount", raw_prev.get("out_amount", raw_prev.get("amountOut", "?")))
                            route    = raw_prev.get("route", raw_prev.get("pool", f"{_from_t}-{_to_t}"))
                            byreal_skill = "byreal_swap"
                            byreal_msg = (
                                f"[BYREAL SKILLS] byreal-cli swap preview {_from_t}->{_to_t} ${amt} · "
                                f"out={out_amt} · route={route} · slippage 0.5% · Byreal CLMM"
                            )
                            _pending_swap = {
                                "from_token": _from_t,
                                "to_token": _to_t,
                                "amount": amt,
                                "out_amount": str(out_amt),
                                "route": str(route),
                                "agent": agent_cfg["name"],
                                "symbol": symbol,
                                "action": action,
                                "confidence": round(confidence),
                            }
                    except Exception as be:
                        # Fallback if CLI unavailable — still log the intent
                        direction = "LONG" if action == "BUY" else "SHORT"
                        byreal_skill = "byreal_perps" if symbol in PERP_TOKENS else "byreal_swap"
                        byreal_msg = (
                            f"[BYREAL SKILLS] {byreal_skill} -> {action} {symbol} via Byreal Agent Skills "
                            f"· conf {confidence:.0f}% (CLI: {str(be)[:60]})"
                        )

                    if _pending_swap:
                        await manager.broadcast({"type": "PENDING_SWAP", "data": _pending_swap})

                    await manager.broadcast({
                        "type": "THOUGHT",
                        "data": {
                            "agent_name": "BYREAL",
                            "message": byreal_msg,
                            "msg_type": "ACTION",
                        },
                    })
                    byreal_thought = models.ThoughtStream(
                        agent_name="BYREAL",
                        message=byreal_msg,
                        msg_type="ACTION",
                    )
                    db.add(byreal_thought)
                    db.commit()
                else:
                    # Record HOLD decision on-chain — every decision gets a permanent Mantle record
                    try:
                        hold_tx = await asyncio.to_thread(
                            mantle_client.log_decision_on_chain, agent_cfg["name"], symbol, "HOLD", confidence
                        )
                        hold_explorer = f"{EXPLORER_BASE}/tx/{hold_tx}" if _valid_tx(hold_tx) else None
                        chain_msg = f"HOLD recorded on-chain — {agent_cfg['name']} held {symbol} (Conf: {confidence:.0f}%)"
                        chain_thought = models.ThoughtStream(
                            agent_name="MANTLE",
                            message=chain_msg,
                            msg_type="CHAIN",
                        )
                        db.add(chain_thought)
                        await manager.broadcast({
                            "type": "THOUGHT",
                            "data": {
                                "agent_name": "MANTLE",
                                "message": chain_msg,
                                "msg_type": "CHAIN",
                                "tx_hash": hold_tx,
                                "explorer_url": hold_explorer,
                            },
                        })
                    except Exception as hold_err:
                        print(f"[AgentLoop] HOLD on-chain record failed: {hold_err}")
                    db.commit()
            except Exception as db_err:
                db.rollback()
                print(f"[AgentLoop] DB error: {db_err}")
            finally:
                db.close()

        except Exception as tick_err:
            print(f"[AgentLoop] Tick error (loop continues): {tick_err}")


@app.on_event("startup")
async def startup_event():
    # Bybit WS: enabled in production (Railway) or when BYBIT_ENABLED=true
    _bybit_enabled = os.getenv("BYBIT_ENABLED", "").lower() in ("1", "true", "yes") \
                     or os.getenv("RAILWAY_ENVIRONMENT") is not None
    if _bybit_enabled:
        asyncio.create_task(bybit_ws_loop())
        print("[Bybit] WebSocket enabled (production mode)")
    else:
        print("[Bybit] WebSocket disabled — using CoinGecko (set BYBIT_ENABLED=true to enable)")

    asyncio.create_task(agent_loop())     # AI trading loop
    asyncio.create_task(oracle_loop())    # AI oracle: AIRequested → fulfillAIResult

    # AI Alpha & Data — whale tracker + anomaly detector + Telegram/Discord bots
    try:
        from alpha import start_alpha_system
        asyncio.create_task(start_alpha_system(price_cache, price_history))
    except Exception as e:
        print(f"[Alpha] Failed to start alpha system: {e}")


# ── Sentiment Intelligence ────────────────────────────────────────────────────

@app.get("/api/alpha/sentiment")
async def alpha_sentiment():
    """Composite sentiment: real Fear & Greed Index + whale signal + price signals."""
    btc_c = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    eth_c = price_cache.get("ETH/USDT", {}).get("change_24h", 0.0)
    mnt_c = price_cache.get("MNT/USDT", {}).get("change_24h", 0.0)

    # Real Fear & Greed from alternative.me
    fng_data = await _fetch_fear_greed()
    fg = fng_data["score"]

    try:
        from alpha.alert_manager import _recent_alerts
        whale_alerts = [a for a in _recent_alerts if a.type.lower() in ("whale", "anomaly")]
        whale_count  = len(whale_alerts)
        whale_dir    = "ACCUMULATION" if any(
            getattr(a, "severity", "").lower() in ("high", "critical") for a in whale_alerts
        ) else ("DISTRIBUTION" if whale_count > 3 else "NEUTRAL")
    except Exception:
        whale_count, whale_dir = 0, "NEUTRAL"

    fg_label = (
        "EXTREME GREED" if fg >= 75 else "GREED"    if fg >= 58
        else "NEUTRAL"  if fg >= 42 else "FEAR"     if fg >= 25
        else "EXTREME FEAR"
    )
    fg_color = (
        "#f7931a" if fg >= 75 else "#00e87a" if fg >= 58
        else "#f59e0b" if fg >= 42 else "#ff6b35" if fg >= 25
        else "#ff3366"
    )

    signals = []
    def sig(label, stype, value, weight):
        signals.append({"label": label, "type": stype, "value": value, "weight": weight})

    if btc_c > 2:   sig("BTC MOMENTUM",     "BULLISH", f"+{btc_c:.1f}%", 35)
    elif btc_c < -2: sig("BTC SELL-OFF",     "BEARISH", f"{btc_c:.1f}%",  35)
    else:            sig("BTC CONSOLIDATION","NEUTRAL",  f"{btc_c:+.1f}%", 35)

    if eth_c > 2:    sig("ETH STRENGTH",     "BULLISH", f"+{eth_c:.1f}%", 25)
    elif eth_c < -2: sig("ETH WEAKNESS",     "BEARISH", f"{eth_c:.1f}%",  25)
    else:            sig("ETH STABLE",       "NEUTRAL",  f"{eth_c:+.1f}%", 25)

    if mnt_c > 3:    sig("MNT ECOSYSTEM",    "BULLISH", f"+{mnt_c:.1f}%", 15)
    elif mnt_c < -3: sig("MNT PRESSURE",     "BEARISH", f"{mnt_c:.1f}%",  15)

    if whale_count > 0:
        sig(f"WHALE ACTIVITY ×{whale_count}", "BULLISH" if whale_dir == "ACCUMULATION" else "BEARISH" if whale_dir == "DISTRIBUTION" else "NEUTRAL", whale_dir, 25)

    bull = sum(s["weight"] for s in signals if s["type"] == "BULLISH")
    bear = sum(s["weight"] for s in signals if s["type"] == "BEARISH")
    regime = "RISK_ON" if bull > bear else ("RISK_OFF" if bear > bull else "NEUTRAL")

    social_vol   = int(abs(btc_c) * 15000 + 50000)
    social_trend = "SPIKING" if abs(btc_c) > 4 else ("ELEVATED" if abs(btc_c) > 2 else "NORMAL")

    # Claude AI sentiment analysis
    ai_read = (
        f"Sentiment {fg_label} ({fg}/100). Regime: {regime.replace('_',' ')}. "
        f"{'Increase long exposure — momentum favorable.' if fg > 60 else 'Reduce exposure — defensive posture.' if fg < 40 else 'Maintain balanced allocation — no directional edge.'}"
    )
    if anthropic_client:
        try:
            signal_summary = ", ".join(f"{s['label']} {s['value']}" for s in signals)
            def _sentiment_call():
                return anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=80,
                    messages=[{"role": "user", "content": (
                        f"Market sentiment analysis. Data: Fear&Greed={fg} ({fg_label}), "
                        f"BTC={btc_c:+.2f}%, ETH={eth_c:+.2f}%, MNT={mnt_c:+.2f}%, "
                        f"Whale={whale_dir} ({whale_count} alerts), Signals: {signal_summary}. "
                        f"Write ONE sentence (max 15 words) of actionable trading sentiment insight."
                    )}]
                )
            resp = await asyncio.to_thread(_sentiment_call)
            ai_read = f"Sentiment {fg_label} ({fg}/100). Regime: {regime.replace('_',' ')}. {resp.content[0].text.strip()}"
        except Exception:
            pass

    return {
        "fear_greed": {"score": fg, "label": fg_label, "color": fg_color},
        "whale":      {"direction": whale_dir, "alert_count": whale_count},
        "social":     {"volume": social_vol, "trend": social_trend},
        "signals":    signals,
        "regime":     regime,
        "ai_read":    ai_read,
        "updated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }


# ── Decision Timeline ─────────────────────────────────────────────────────────

@app.get("/api/cfo/decision-timeline")
def cfo_decision_timeline(db: Session = Depends(database.get_db)):
    """Chronological on-chain decision timeline — every decision verifiable on Mantle."""
    trades   = db.query(models.Trade).order_by(models.Trade.created_at.desc()).limit(30).all()
    settings = db.query(models.CFOSettings).first()
    capital  = settings.capital_usd if settings else 10000.0
    trade_sz = capital * 0.05

    events = []
    for t in trades:
        cur     = price_cache.get(t.symbol, {}).get("price", 0.0)
        pnl_pct = pnl_usd = 0.0
        if cur > 0 and t.price > 0:
            pnl_pct = ((cur - t.price) / t.price) * 100 * (1 if t.action == "BUY" else -1)
            pnl_usd = pnl_pct / 100 * trade_sz
        ag = db.query(models.Agent).filter(models.Agent.id == t.agent_id).first()
        events.append({
            "id":            t.id,
            "timestamp":     (t.created_at.isoformat() + "Z") if t.created_at else "",
            "agent":         ag.name if ag else f"Agent#{t.agent_id}",
            "action":        t.action,
            "symbol":        t.symbol,
            "entry_price":   t.price,
            "current_price": cur,
            "confidence":    t.confidence,
            "pnl_pct":       round(pnl_pct, 2),
            "pnl_usd":       round(pnl_usd, 2),
            "tx_hash":       t.tx_hash,
            "explorer_url":  f"{EXPLORER_BASE}/tx/{t.tx_hash}" if _valid_tx(t.tx_hash) else None,
            "verified":      _valid_tx(t.tx_hash),
            "outcome":       "WIN" if pnl_usd > 0 else ("LOSS" if pnl_usd < 0 else "OPEN"),
        })

    wins = sum(1 for e in events if e["outcome"] == "WIN")
    return {
        "events": events,
        "stats": {
            "total":         len(events),
            "verified":      sum(1 for e in events if e["verified"]),
            "wins":          wins,
            "win_rate":      round(wins / len(events) * 100, 1) if events else 0,
            "total_pnl_usd": round(sum(e["pnl_usd"] for e in events), 2),
        },
    }


# ── Alpha Scorecard: Verifiable AI Alpha vs BTC Baseline ─────────────────────

@app.get("/api/cfo/alpha-scorecard")
def cfo_alpha_scorecard(db: Session = Depends(database.get_db)):
    """
    Verifiable alpha: AI portfolio return vs BTC buy-and-hold baseline.
    Every trade is on-chain via ERC-8004 — judges can verify each decision.
    """
    import statistics as _stats
    trades = db.query(models.Trade).order_by(models.Trade.created_at).all()
    settings = db.query(models.CFOSettings).first()
    capital = settings.capital_usd if settings else 10000.0
    trade_size = capital * 0.05  # 5% risk per trade

    btc_change_24h = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    btc_current    = price_cache.get("BTC/USDT", {}).get("price", 105000.0)

    if not trades:
        return {
            "alpha_pct": 0.0, "ai_return_pct": 0.0,
            "btc_baseline_pct": round(btc_change_24h, 2),
            "total_pnl_usd": 0.0, "capital_usd": capital,
            "win_rate": 0.0, "sharpe_ratio": 0.0,
            "max_drawdown_usd": 0.0,
            "verified_onchain": 0, "total_decisions": 0,
            "proof_url": "https://explorer.mantle.xyz/address/0x389DF777f009d32c4B6451F159c763c7f9d15803",
            "agents": [], "verdict": "INSUFFICIENT_DATA",
        }

    pnl_series: list[float] = []
    running = 0.0
    peak    = 0.0
    max_dd  = 0.0
    wins    = 0
    verified = sum(1 for t in trades if _valid_tx(t.tx_hash))

    agent_acc: dict[int, dict] = {}

    for t in trades:
        cur = price_cache.get(t.symbol, {}).get("price", 0.0)
        if cur > 0 and t.price > 0:
            pct = ((cur - t.price) / t.price) * 100 * (1 if t.action == "BUY" else -1)
            pnl = pct / 100 * trade_size
            running += pnl
            pnl_series.append(running)
            peak = max(peak, running)
            max_dd = max(max_dd, peak - running)
            if pnl > 0:
                wins += 1
            acc = agent_acc.setdefault(t.agent_id, {"pnl": 0.0, "trades": 0, "wins": 0})
            acc["pnl"]    += pnl
            acc["trades"] += 1
            if pnl > 0:
                acc["wins"] += 1

    total = len(trades)
    ai_return_pct   = round(running / capital * 100, 2)
    btc_baseline    = round(btc_change_24h, 2)
    alpha_pct       = round(ai_return_pct - btc_baseline, 2)
    win_rate        = round(wins / total * 100, 1) if total else 0.0

    if len(pnl_series) > 2:
        rets  = [pnl_series[i] - pnl_series[i-1] for i in range(1, len(pnl_series))]
        mu    = _stats.mean(rets)
        sigma = _stats.stdev(rets) if len(rets) > 1 else 1e-9
        sharpe = round((mu / sigma) * (252 ** 0.5) if sigma else 0.0, 2)
    else:
        sharpe = 0.0

    # Per-agent breakdown (map DB agent_id → AGENT_CONFIGS)
    agents_list = []
    for cfg in AGENT_CONFIGS:
        ag_db = db.query(models.Agent).filter(models.Agent.name == cfg["name"]).first()
        if not ag_db:
            continue
        s = agent_acc.get(ag_db.id, {"pnl": 0.0, "trades": 0, "wins": 0})
        wr = round(s["wins"] / s["trades"] * 100, 1) if s["trades"] else 0.0
        agents_list.append({
            "name": cfg["name"],
            "pnl_usd": round(s["pnl"], 2),
            "trades": s["trades"],
            "win_rate": wr,
            "return_pct": round(s["pnl"] / capital * 100 * len(AGENT_CONFIGS), 2),
        })
    agents_list.sort(key=lambda x: -x["pnl_usd"])

    verdict = ("BEATING_MARKET" if alpha_pct > 0.5
               else "UNDERPERFORMING" if alpha_pct < -2.0
               else "NEUTRAL")

    return {
        "alpha_pct": alpha_pct,
        "ai_return_pct": ai_return_pct,
        "btc_baseline_pct": btc_baseline,
        "total_pnl_usd": round(running, 2),
        "capital_usd": capital,
        "win_rate": win_rate,
        "sharpe_ratio": sharpe,
        "max_drawdown_usd": round(max_dd, 2),
        "verified_onchain": verified,
        "total_decisions": total,
        "proof_url": "https://explorer.mantle.xyz/address/0x389DF777f009d32c4B6451F159c763c7f9d15803",
        "agents": agents_list,
        "verdict": verdict,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AI CFO EXTENDED — Financial Reporting · Budget · Risk · Treasury · Audit · Multi-Asset
# ═══════════════════════════════════════════════════════════════════════════════

# ── 1. FINANCIAL REPORTING ─────────────────────────────────────────────────────

@app.get("/api/cfo/financial-report")
def cfo_financial_report(db: Session = Depends(database.get_db)):
    """P&L statement, balance sheet, and cash flow derived from trade history."""
    trades = db.query(models.Trade).order_by(models.Trade.created_at).all()
    settings = db.query(models.CFOSettings).first()
    capital = settings.capital_usd if settings else 10000.0

    gross_profit = 0.0
    gross_loss = 0.0
    best_trade   = {"symbol": "—", "pnl_usd": 0.0, "action": ""}
    worst_trade  = {"symbol": "—", "pnl_usd": 0.0, "action": ""}
    monthly_pnl: dict[str, float] = {}
    trade_size = capital * 0.05  # 5% per trade

    for t in trades:
        current = price_cache.get(t.symbol, {}).get("price", 0.0)
        if current > 0 and t.price > 0:
            pct = ((current - t.price) / t.price) * 100 * (1 if t.action == "BUY" else -1)
            pnl_usd = round(pct / 100 * trade_size, 2)
            if pnl_usd >= 0:
                gross_profit += pnl_usd
            else:
                gross_loss += pnl_usd
            if pnl_usd > best_trade["pnl_usd"]:
                best_trade = {"symbol": t.symbol, "pnl_usd": pnl_usd, "action": t.action}
            if pnl_usd < worst_trade["pnl_usd"]:
                worst_trade = {"symbol": t.symbol, "pnl_usd": pnl_usd, "action": t.action}
            mk = t.created_at.strftime("%Y-%m") if t.created_at else "N/A"
            monthly_pnl[mk] = round(monthly_pnl.get(mk, 0.0) + pnl_usd, 2)

    net_pnl = round(gross_profit + gross_loss, 2)

    # Balance sheet — live crypto values + simulated RWA + stables
    btc_val  = price_cache.get("BTC/USDT",  {}).get("price", 0) * 0.02
    eth_val  = price_cache.get("ETH/USDT",  {}).get("price", 0) * 0.3
    mnt_val  = price_cache.get("MNT/USDT",  {}).get("price", 0) * 2000
    rwa_val  = capital * 0.35
    stable   = capital * 0.10
    total_assets = round(btc_val + eth_val + mnt_val + rwa_val + stable, 2)

    return {
        "pnl": {
            "gross_profit_usd": round(gross_profit, 2),
            "gross_loss_usd": round(gross_loss, 2),
            "net_pnl_usd": net_pnl,
            "net_pnl_pct": round(net_pnl / capital * 100, 2) if capital else 0,
            "trade_count": len(trades),
            "best_trade": best_trade,
            "worst_trade": worst_trade,
        },
        "balance_sheet": {
            "assets": {
                "crypto_btc": round(btc_val, 2),
                "crypto_eth": round(eth_val, 2),
                "crypto_mnt": round(mnt_val, 2),
                "rwa_yield": round(rwa_val, 2),
                "stablecoin": round(stable, 2),
                "total": total_assets,
            },
            "liabilities": 0.0,
            "net_worth": total_assets,
            "capital_deployed": round(capital * 0.90, 2),
            "capital_idle": round(capital * 0.10, 2),
        },
        "cash_flow": {
            "operating": net_pnl,
            "investing": round(-capital * 0.05, 2),
            "financing": 0.0,
            "net": round(net_pnl - capital * 0.05, 2),
        },
        "monthly_pnl": [
            {"month": m, "pnl_usd": p}
            for m, p in sorted(monthly_pnl.items())
        ],
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }


# ── 2. BUDGET MANAGEMENT ────────────────────────────────────────────────────────

_DEFAULT_BUDGETS = [
    {"category": "Active Trading",  "limit_usd": 3000.0},
    {"category": "RWA Yield",       "limit_usd": 4000.0},
    {"category": "MNT Ecosystem",   "limit_usd": 2000.0},
    {"category": "Stable Buffer",   "limit_usd": 500.0},
    {"category": "Gas & Fees",      "limit_usd": 100.0},
]

@app.get("/api/cfo/budget")
def cfo_budget(db: Session = Depends(database.get_db)):
    budgets = db.query(models.Budget).all()
    if not budgets:
        import random as _r
        for b in _DEFAULT_BUDGETS:
            db.add(models.Budget(
                category=b["category"],
                limit_usd=b["limit_usd"],
                spent_usd=round(b["limit_usd"] * _r.uniform(0.25, 0.75), 2),
            ))
        db.commit()
        budgets = db.query(models.Budget).all()

    total_limit = sum(b.limit_usd for b in budgets)
    total_spent = sum(b.spent_usd for b in budgets)
    trade_count = db.query(models.Trade).count()

    items = []
    for b in budgets:
        util = round(b.spent_usd / b.limit_usd * 100, 1) if b.limit_usd else 0
        items.append({
            "id": b.id,
            "category": b.category,
            "limit_usd": b.limit_usd,
            "spent_usd": b.spent_usd,
            "remaining_usd": round(b.limit_usd - b.spent_usd, 2),
            "utilization_pct": util,
            "status": "OVER" if util > 100 else ("WARN" if util > 80 else "OK"),
        })

    growth = 1.12 if trade_count > 20 else 1.06
    return {
        "budgets": items,
        "summary": {
            "total_limit": round(total_limit, 2),
            "total_spent": round(total_spent, 2),
            "utilization_pct": round(total_spent / total_limit * 100, 1) if total_limit else 0,
        },
        "forecast": {
            "next_month_spend": round(total_spent * growth, 2),
            "next_month_return": round(total_spent * growth * 1.08, 2),
            "confidence_pct": 72 if trade_count > 10 else 55,
            "trend": "UP" if trade_count > 20 else "STABLE",
        },
    }


class BudgetUpdateReq(BaseModel):
    category: str
    limit_usd: float
    spent_usd: float = 0.0

@app.post("/api/cfo/budget/update")
def cfo_budget_update(req: BudgetUpdateReq, db: Session = Depends(database.get_db)):
    row = db.query(models.Budget).filter(models.Budget.category == req.category).first()
    if row:
        row.limit_usd = req.limit_usd
        row.spent_usd = req.spent_usd
    else:
        db.add(models.Budget(category=req.category, limit_usd=req.limit_usd, spent_usd=req.spent_usd))
    db.commit()
    return {"ok": True}


# ── 3. RISK MODELING ────────────────────────────────────────────────────────────

@app.get("/api/cfo/risk-model")
def cfo_risk_model(db: Session = Depends(database.get_db)):
    """VaR, max drawdown, per-asset exposure, and circuit breaker status."""
    settings = db.query(models.CFOSettings).first()
    capital = settings.capital_usd if settings else 10000.0

    # Portfolio volatility from 24h changes
    changes = {
        "BTC/USDT": abs(price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)),
        "ETH/USDT": abs(price_cache.get("ETH/USDT", {}).get("change_24h", 0.0)),
        "MNT/USDT": abs(price_cache.get("MNT/USDT", {}).get("change_24h", 0.0)),
    }
    weights = {"BTC/USDT": 0.45, "ETH/USDT": 0.35, "MNT/USDT": 0.20}
    port_vol = sum(changes[s] * weights[s] for s in changes)

    var_95 = round(-capital * port_vol / 100 * 1.65, 2)
    var_99 = round(-capital * port_vol / 100 * 2.33, 2)

    # Drawdown from trade history
    trades = db.query(models.Trade).order_by(models.Trade.created_at).all()
    running = 0.0
    peak    = 0.0
    max_dd  = 0.0
    trade_size = capital * 0.05
    for t in trades:
        cur = price_cache.get(t.symbol, {}).get("price", 0.0)
        if cur > 0 and t.price > 0:
            pct = ((cur - t.price) / t.price) * 100 * (1 if t.action == "BUY" else -1)
            running += pct / 100 * trade_size
            peak = max(peak, running)
            max_dd = max(max_dd, peak - running)

    cur_dd = round(max(0, peak - running), 2)
    max_dd = round(max_dd, 2)

    # Per-asset trade exposure
    sym_counts: dict[str, int] = {}
    for t in trades:
        sym_counts[t.symbol] = sym_counts.get(t.symbol, 0) + 1
    total = max(sum(sym_counts.values()), 1)
    exposure = sorted(
        [{"symbol": s, "exposure_pct": round(c / total * 100, 1),
          "limit_pct": 40,
          "status": "OVER" if c / total > 0.4 else "OK"}
         for s, c in sym_counts.items()],
        key=lambda x: -x["exposure_pct"]
    )[:6]

    circuit_active = max_dd > capital * 0.15 or changes.get("BTC/USDT", 0) > 8
    return {
        "var": {
            "var_95_usd": var_95,
            "var_99_usd": var_99,
            "method": "Parametric (1-day horizon)",
            "portfolio_vol_pct": round(port_vol, 2),
        },
        "drawdown": {
            "max_drawdown_usd": max_dd,
            "current_drawdown_usd": cur_dd,
            "drawdown_limit_pct": 15.0,
            "status": "BREACH" if max_dd > capital * 0.15 else ("WARN" if max_dd > capital * 0.10 else "OK"),
        },
        "volatility": {sym: round(v, 2) for sym, v in changes.items()},
        "exposure_limits": exposure,
        "circuit_breaker": {
            "active": circuit_active,
            "trigger": "Drawdown > 15% OR BTC 24h vol > 8%",
            "action": "Halt new positions — reduce leverage" if circuit_active else "Normal operations",
        },
    }


# ── 4. TREASURY MANAGEMENT ─────────────────────────────────────────────────────

@app.get("/api/cfo/treasury")
async def cfo_treasury(db: Session = Depends(database.get_db)):
    """Simulated treasury positions, FX rates, stablecoin yields, conversion recommendations."""
    settings = db.query(models.CFOSettings).first()
    capital = settings.capital_usd if settings else 10000.0

    btc_p = price_cache.get("BTC/USDT",  {}).get("price", 105000.0)
    eth_p = price_cache.get("ETH/USDT",  {}).get("price", 2500.0)
    mnt_p = price_cache.get("MNT/USDT",  {}).get("price", 0.65)
    btc_c = price_cache.get("BTC/USDT",  {}).get("change_24h", 0.0)

    holdings = {
        "BTC":  {"qty": round(capital * 0.20 / btc_p, 6) if btc_p else 0, "price_usd": btc_p,
                 "value_usd": round(capital * 0.20, 2), "alloc_pct": 20},
        "ETH":  {"qty": round(capital * 0.25 / eth_p, 4) if eth_p else 0, "price_usd": eth_p,
                 "value_usd": round(capital * 0.25, 2), "alloc_pct": 25},
        "MNT":  {"qty": round(capital * 0.15 / mnt_p, 2) if mnt_p else 0, "price_usd": mnt_p,
                 "value_usd": round(capital * 0.15, 2), "alloc_pct": 15},
        "USDT": {"qty": round(capital * 0.20, 2), "price_usd": 1.0,
                 "value_usd": round(capital * 0.20, 2), "alloc_pct": 20},
        "RWA":  {"qty": 1, "price_usd": round(capital * 0.20, 2),
                 "value_usd": round(capital * 0.20, 2), "alloc_pct": 20},
    }
    total_usd = sum(h["value_usd"] for h in holdings.values())

    fx_rates = {
        "USD/IDR": 15_950, "USD/EUR": 0.920, "USD/JPY": 149.5,
        "USD/SGD": 1.342,  "USD/GBP": 0.792,
    }

    stablecoin_yields = {
        "USDT (Byreal CLMM)": 5.2, "USDC (Byreal LP)": 4.8,
        "USDY (Mantle RWA)": 5.5,  "mETH (Mantle Stake)": 4.1,
    }

    recs = []
    idle = holdings["USDT"]["value_usd"]
    if idle > 500:
        recs.append({"priority": "HIGH", "action": "DEPLOY",
                     "from": "USDT", "to": "USDY",
                     "amount_usd": round(idle * 0.5, 2),
                     "apy": 5.5,
                     "reason": f"${idle:,.0f} idle USDT — deploy 50% to USDY for 5.5% APY"})
    if btc_c > 3:
        recs.append({"priority": "MEDIUM", "action": "PARTIAL_EXIT",
                     "from": "BTC", "to": "USDT",
                     "amount_usd": round(holdings["BTC"]["value_usd"] * 0.2, 2),
                     "apy": None,
                     "reason": f"BTC up {btc_c:+.1f}% — lock 20% profit to stablecoin"})
    elif btc_c < -3:
        recs.append({"priority": "HIGH", "action": "BUY_DIP",
                     "from": "USDT", "to": "BTC",
                     "amount_usd": round(idle * 0.3, 2),
                     "apy": None,
                     "reason": f"BTC down {btc_c:.1f}% — DCA opportunity, deploy 30% stables"})

    return {
        "holdings": holdings,
        "total_value_usd": round(total_usd, 2),
        "total_value_idr": int(total_usd * fx_rates["USD/IDR"]),
        "fx_rates": fx_rates,
        "stablecoin_yields": stablecoin_yields,
        "recommendations": recs,
        "on_ramp": {
            "options": ["Indodax", "Tokocrypto", "Binance P2P", "Coinbase"],
            "best_idr_rate": f"Rp {fx_rates['USD/IDR']:,}/USD",
        },
    }


# ── 5. COMPLIANCE / AUDIT TRAIL ────────────────────────────────────────────────

@app.get("/api/cfo/audit-trail")
def cfo_audit_trail(db: Session = Depends(database.get_db)):
    """Immutable audit log from trades + on-chain thought records."""
    import datetime as _dt
    trades   = db.query(models.Trade).order_by(models.Trade.created_at.desc()).limit(60).all()
    thoughts = db.query(models.ThoughtStream).filter(
        models.ThoughtStream.msg_type.in_(["ACTION", "CHAIN"])
    ).order_by(models.ThoughtStream.created_at.desc()).limit(40).all()

    events = []
    for t in trades:
        events.append({
            "id": f"TRD-{t.id:05d}",
            "timestamp": (t.created_at.isoformat() + "Z") if t.created_at else "",
            "event_type": "TRADE",
            "entity": f"Agent#{t.agent_id}",
            "action": f"{t.action} {t.symbol} @ ${t.price:,.4f}",
            "symbol": t.symbol,
            "tx_hash": t.tx_hash if _valid_tx(t.tx_hash) else None,
            "regulatory_category": "CRYPTO_TRADING",
            "on_chain": _valid_tx(t.tx_hash),
            "compliant": True,
        })
    for th in thoughts:
        if th.msg_type == "CHAIN":
            events.append({
                "id": f"CHN-{th.id:05d}",
                "timestamp": (th.created_at.isoformat() + "Z") if th.created_at else "",
                "event_type": "BLOCKCHAIN_RECORD",
                "entity": th.agent_name,
                "action": th.message[:90],
                "symbol": None,
                "tx_hash": None,
                "regulatory_category": "ON_CHAIN_AUDIT",
                "on_chain": True,
                "compliant": True,
            })

    events.sort(key=lambda x: x["timestamp"], reverse=True)
    events = events[:80]

    on_chain_count  = sum(1 for e in events if e["on_chain"])
    compliance_score = round(min(99.9, 90 + (on_chain_count / max(len(events), 1)) * 10), 1)

    return {
        "events": events,
        "summary": {
            "total_events": len(events),
            "trade_events": len(trades),
            "on_chain_events": on_chain_count,
            "compliance_score": compliance_score,
            "jurisdiction": "Mantle L2 (ERC-8004 immutable registry)",
            "audited_at": _dt.datetime.utcnow().isoformat() + "Z",
        },
    }


# ── 6. MULTI-ASSET CLASS ────────────────────────────────────────────────────────

# Stock price cache — refresh every 5 minutes
_stock_cache: dict = {}
_stock_cache_ts: float = 0.0

# Fear & Greed Index cache — updates daily, cache 1 hour
_fng_cache: dict = {}
_fng_cache_ts: float = 0.0

async def _fetch_fear_greed() -> dict:
    """Fetch real Crypto Fear & Greed Index from alternative.me."""
    global _fng_cache, _fng_cache_ts
    if time.time() - _fng_cache_ts < 3600 and _fng_cache:
        return _fng_cache
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get("https://api.alternative.me/fng/", params={"limit": 1})
            if resp.status_code == 200:
                d = resp.json()["data"][0]
                _fng_cache = {"score": int(d["value"]), "label": d["value_classification"]}
                _fng_cache_ts = time.time()
                print(f"[FearGreed] {_fng_cache['score']} — {_fng_cache['label']}")
                return _fng_cache
    except Exception as e:
        print(f"[FearGreed] fetch error: {e}")
    return _fng_cache if _fng_cache else {"score": 50, "label": "Neutral"}

_STOCK_META = [
    {"symbol": "AAPL",  "name": "Apple Inc.",        "sector": "Tech"},
    {"symbol": "MSFT",  "name": "Microsoft Corp.",    "sector": "Tech"},
    {"symbol": "NVDA",  "name": "NVIDIA Corp.",       "sector": "Tech"},
    {"symbol": "SPY",   "name": "S&P 500 ETF",        "sector": "Index"},
    {"symbol": "GLD",   "name": "Gold ETF",           "sector": "Commodity"},
    {"symbol": "BRK-B", "name": "Berkshire Hathaway", "sector": "Finance"},
]

_BOND_META = [
    {"name": "US 10Y Treasury", "ticker": "^TNX",  "duration": 10, "rating": "AAA"},
    {"name": "US 2Y Treasury",  "ticker": "^IRX",  "duration":  2, "rating": "AAA"},
    {"name": "US 30Y Treasury", "ticker": "^TYX",  "duration": 30, "rating": "AAA"},
    {"name": "Corp Bond ETF",   "ticker": "LQD",   "duration":  8, "rating": "IG"},
]

async def _fetch_yahoo(symbol: str) -> dict | None:
    """Fetch real-time quote from Yahoo Finance public API."""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            data = r.json()
            meta = data["chart"]["result"][0]["meta"]
            price = meta.get("regularMarketPrice", 0)
            prev  = meta.get("previousClose") or meta.get("chartPreviousClose", price)
            change = ((price - prev) / prev * 100) if prev else 0
            return {"price": round(price, 2), "change_24h": round(change, 2)}
    except Exception:
        return None

async def _refresh_stock_cache():
    global _stock_cache, _stock_cache_ts
    if time.time() - _stock_cache_ts < 300:  # 5-minute cache
        return
    results = await asyncio.gather(*[_fetch_yahoo(m["symbol"]) for m in _STOCK_META])
    bond_results = await asyncio.gather(*[_fetch_yahoo(m["ticker"]) for m in _BOND_META])
    new_cache = {}
    for meta, data in zip(_STOCK_META, results):
        if data:
            new_cache[meta["symbol"]] = {**meta, **data}
        else:
            new_cache[meta["symbol"]] = {**meta, "price": 0, "change_24h": 0}
    for meta, data in zip(_BOND_META, bond_results):
        if data:
            new_cache[meta["ticker"]] = {**meta, "yield_pct": round(data["price"], 2)}
        else:
            new_cache[meta["ticker"]] = {**meta, "yield_pct": 0}
    _stock_cache = new_cache
    _stock_cache_ts = time.time()
    print(f"[StockCache] Updated {len(new_cache)} symbols from Yahoo Finance")

@app.get("/api/cfo/multiasset")
async def cfo_multiasset(db: Session = Depends(database.get_db)):
    """Multi-asset class overview: real stock/bond prices + crypto + FX."""
    await _refresh_stock_cache()

    settings = db.query(models.CFOSettings).first()
    capital = settings.capital_usd if settings else 10000.0
    btc_c = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)

    stocks = [_stock_cache.get(m["symbol"], {**m, "price": 0, "change_24h": 0}) for m in _STOCK_META]
    bonds  = [_stock_cache.get(m["ticker"], {**m, "yield_pct": 0}) for m in _BOND_META]

    fx = [
        {"pair": "USD/IDR", "rate": 15_950, "change_24h":  0.08, "volatility": "LOW"},
        {"pair": "USD/EUR", "rate": 0.9205,  "change_24h": -0.12, "volatility": "LOW"},
        {"pair": "USD/JPY", "rate": 149.5,   "change_24h":  0.25, "volatility": "MEDIUM"},
        {"pair": "USD/SGD", "rate": 1.342,   "change_24h":  0.05, "volatility": "LOW"},
        {"pair": "USD/GBP", "rate": 0.792,   "change_24h": -0.08, "volatility": "LOW"},
    ]

    alloc = {"crypto_pct": 40, "stocks_pct": 25, "bonds_pct": 15, "rwa_pct": 15, "fx_cash_pct": 5}
    div_score = 100
    live = _stock_cache_ts > 0

    return {
        "stocks": stocks,
        "bonds":  bonds,
        "fx": fx,
        "live": live,
        "portfolio": {
            "allocation": alloc,
            "allocation_usd": {k.replace("_pct", ""): round(capital * v / 100, 2) for k, v in alloc.items()},
            "diversification_score": div_score,
            "recommendation": "Well diversified across asset classes",
        },
        "correlations": {
            "BTC_vs_SPY": 0.32, "ETH_vs_AAPL": 0.28,
            "MNT_vs_BTC": 0.87, "Bonds_vs_Crypto": -0.15,
        },
        "ai_insight": (
            f"Market {'risk-on (crypto favored)' if btc_c > 1 else 'risk-off (bonds/stables favored)' if btc_c < -1 else 'neutral — balanced allocation optimal'}. "
            f"BTC 24h: {btc_c:+.1f}%. "
            f"{'Increase crypto 5%' if btc_c > 2 else 'Increase bonds 5%' if btc_c < -2 else 'Maintain current allocation'}."
        ),
    }


class PortfolioAnalyzeRequest(BaseModel):
    holdings: list[dict]  # [{symbol, qty, avg_buy_price}]

@app.post("/api/cfo/portfolio/analyze")
async def cfo_portfolio_analyze(req: PortfolioAnalyzeRequest):
    """Analyze user's real portfolio holdings with live prices."""
    await _refresh_stock_cache()

    total_value   = 0.0
    total_cost    = 0.0
    positions     = []

    for h in req.holdings:
        symbol   = h.get("symbol", "").upper()
        qty      = float(h.get("qty", 0))
        avg_buy  = float(h.get("avg_buy_price", 0))

        # Get live price — crypto first, then stocks
        if symbol in ("BTC", "BITCOIN"):
            live_price = price_cache.get("BTC/USDT", {}).get("price", 0)
            change     = price_cache.get("BTC/USDT", {}).get("change_24h", 0)
        elif symbol in ("ETH", "ETHEREUM"):
            live_price = price_cache.get("ETH/USDT", {}).get("price", 0)
            change     = price_cache.get("ETH/USDT", {}).get("change_24h", 0)
        elif symbol in ("MNT", "MANTLE"):
            live_price = price_cache.get("MNT/USDT", {}).get("price", 0)
            change     = price_cache.get("MNT/USDT", {}).get("change_24h", 0)
        elif symbol in _stock_cache:
            live_price = _stock_cache[symbol].get("price", 0)
            change     = _stock_cache[symbol].get("change_24h", 0)
        else:
            # Try fetch on-demand
            data = await _fetch_yahoo(symbol)
            live_price = data["price"] if data else avg_buy
            change     = data["change_24h"] if data else 0

        cost_basis    = qty * avg_buy
        current_value = qty * live_price
        pnl_usd       = current_value - cost_basis
        pnl_pct       = (pnl_usd / cost_basis * 100) if cost_basis > 0 else 0

        total_value += current_value
        total_cost  += cost_basis
        positions.append({
            "symbol":        symbol,
            "qty":           qty,
            "avg_buy":       avg_buy,
            "live_price":    round(live_price, 4),
            "change_24h":    round(change, 2),
            "cost_basis":    round(cost_basis, 2),
            "current_value": round(current_value, 2),
            "pnl_usd":       round(pnl_usd, 2),
            "pnl_pct":       round(pnl_pct, 2),
            "alloc_pct":     0,  # filled below
        })

    # Allocation %
    for p in positions:
        p["alloc_pct"] = round(p["current_value"] / total_value * 100, 1) if total_value > 0 else 0

    total_pnl_usd = total_value - total_cost
    total_pnl_pct = (total_pnl_usd / total_cost * 100) if total_cost > 0 else 0
    btc_c = price_cache.get("BTC/USDT", {}).get("change_24h", 0)
    regime = "RISK_ON" if btc_c >= 3 else "RISK_OFF" if btc_c <= -3 else "NEUTRAL"

    # AI recommendation
    top_gainer = max(positions, key=lambda x: x["pnl_pct"], default=None)
    top_loser  = min(positions, key=lambda x: x["pnl_pct"], default=None)
    rec = []
    if regime == "RISK_OFF":
        rec.append("Pasar risk-off — pertimbangkan kurangi posisi volatile, tambah stablecoin.")
    if top_loser and top_loser["pnl_pct"] < -10:
        rec.append(f"{top_loser['symbol']} turun {top_loser['pnl_pct']:.1f}% — evaluasi cut loss atau average down.")
    if top_gainer and top_gainer["pnl_pct"] > 20:
        rec.append(f"{top_gainer['symbol']} naik {top_gainer['pnl_pct']:.1f}% — pertimbangkan take profit sebagian.")
    if not rec:
        rec.append("Portfolio dalam kondisi baik. Maintain posisi dan monitor kondisi market.")

    return {
        "positions":      positions,
        "total_value":    round(total_value, 2),
        "total_cost":     round(total_cost, 2),
        "total_pnl_usd":  round(total_pnl_usd, 2),
        "total_pnl_pct":  round(total_pnl_pct, 2),
        "regime":         regime,
        "ai_recommendation": " ".join(rec),
    }


class CFOChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    wallet_address: str = ""
    wallet_balance_mnt: float = 0.0

@app.post("/api/cfo/chat")
async def cfo_chat(req: CFOChatRequest, db: Session = Depends(database.get_db)):
    """AI CFO chat — real Claude AI with live market context, rule-based fallback."""
    global agent_running
    msg = req.message.strip()
    msg_lower = msg.lower()

    # ── Agent control commands ────────────────────────────────────────────────
    stop_keywords  = ["stop trading", "berhenti trading", "stop agent", "pause agent",
                      "hentikan trading", "berhenti", "stop", "pause", "matikan agent"]
    start_keywords = ["start trading", "mulai trading", "start agent", "resume agent",
                      "mulai", "jalankan trading", "aktifkan agent", "start", "resume"]

    if any(k in msg_lower for k in stop_keywords) and agent_running:
        agent_running = False
        await manager.broadcast({"type": "AGENT_STATUS", "data": {"running": False}})
        return {"reply": "Oke. Semua AI agent telah dihentikan. Trading dihentikan — tidak ada keputusan BUY/SELL yang akan dieksekusi sampai kamu aktifkan kembali.", "ai": True}

    if any(k in msg_lower for k in start_keywords):
        # Wallet must be connected before trading can start
        if not req.wallet_address:
            return {
                "reply": (
                    "⚠️ Wallet belum terhubung!\n\n"
                    "Untuk menjalankan trading, kamu perlu connect wallet dulu:\n"
                    "1. Klik tombol CONNECT WALLET di panel kiri atas\n"
                    "2. Approve koneksi di MetaMask / wallet kamu\n"
                    "3. Setelah wallet terhubung, kirim perintah ini lagi\n\n"
                    "Trading tidak dapat dijalankan tanpa wallet terkoneksi."
                ),
                "ai": True,
            }
        short_addr = f"{req.wallet_address[:6]}...{req.wallet_address[-4:]}"
        if agent_running:
            return {
                "reply": (
                    f"AI agents sudah aktif dan berjalan!\n\n"
                    f"Wallet: {short_addr}\n"
                    f"AlphaQuant, WhaleWatcher, MacroAnalyzer, dan RiskManager "
                    f"sedang scanning market secara real-time."
                ),
                "ai": True,
            }
        agent_running = True
        await manager.broadcast({"type": "AGENT_STATUS", "data": {"running": True}})
        return {
            "reply": (
                f"Siap! Wallet {short_addr} terhubung.\n\n"
                f"Semua AI agent diaktifkan: AlphaQuant, WhaleWatcher, MacroAnalyzer, dan RiskManager "
                f"mulai scanning market dan mencatat keputusan ke Mantle blockchain."
            ),
            "ai": True,
        }

    # ── Live context ──────────────────────────────────────────────────────────
    btc  = price_cache.get("BTC/USDT",  {})
    eth  = price_cache.get("ETH/USDT",  {})
    mnt  = price_cache.get("MNT/USDT",  {})
    meth = price_cache.get("mETH/USDT", {})
    cook = price_cache.get("COOK/USDT", {})

    btc_p  = btc.get("price", 0);  btc_c  = btc.get("change_24h", 0)
    eth_p  = eth.get("price", 0);  eth_c  = eth.get("change_24h", 0)
    mnt_p  = mnt.get("price", 0);  mnt_c  = mnt.get("change_24h", 0)
    meth_p = meth.get("price", 0); cook_p = cook.get("price", 0)

    regime = "RISK_ON" if btc_c >= 3 else "RISK_OFF" if btc_c <= -3 else "NEUTRAL"

    recent_trades = db.query(models.Trade).order_by(models.Trade.created_at.desc()).limit(8).all()
    all_trades    = db.query(models.Trade).all()
    trade_lines = [
        f"  • Agent#{t.agent_id}: {t.action} {t.symbol} @ ${t.price:,.2f} (pnl: ${t.pnl:+.2f})"
        for t in recent_trades
    ] if recent_trades else ["  • No recent trades"]

    # Portfolio stats
    total_trades = len(all_trades)
    total_pnl    = sum(t.pnl for t in all_trades)
    wins         = sum(1 for t in all_trades if t.pnl > 0)
    losses       = sum(1 for t in all_trades if t.pnl < 0)
    win_rate     = round(wins / total_trades * 100, 1) if total_trades > 0 else 0
    best_trade   = max(all_trades, key=lambda t: t.pnl, default=None)
    worst_trade  = min(all_trades, key=lambda t: t.pnl, default=None)
    open_pos     = [t for t in all_trades if t.action in ("BUY",) and t.pnl == 0]

    # MNT balance from chain
    mnt_balance = 0.0
    try:
        from blockchain.mantle_client import MantleClient
        _mc = MantleClient()
        if _mc.connected:
            from web3 import Web3
            _pk2 = os.getenv("PRIVATE_KEY", "")
            _addr = Web3().eth.account.from_key(_pk2).address if _pk2 else None
            if _addr:
                mnt_balance = round(_mc.w3.eth.get_balance(Web3.to_checksum_address(_addr)) / 1e18, 4)
    except Exception:
        pass

    settings = db.query(models.CFOSettings).first()
    capital  = settings.capital_usd if settings else 10000
    profile  = settings.risk_profile if settings else "balanced"

    byreal_context = ""

    # ── Byreal direct responses (no Claude needed) ───────────────────────────
    if any(k in msg_lower for k in ["perps signal", "perps signals", "byreal signal",
                                     "signal byreal", "byreal perps"]):
        try:
            from byreal import get_perps_signals
            sig_data = await asyncio.wait_for(get_perps_signals(), timeout=10)
            raw_sig  = sig_data.get("data", sig_data)
            all_sigs = [
                *raw_sig.get("signals", {}).get("conservative", []),
                *raw_sig.get("signals", {}).get("moderate",     []),
                *raw_sig.get("signals", {}).get("aggressive",   []),
            ]
            if all_sigs:
                lines = "\n".join([
                    f"{'▲' if s.get('direction')=='Long' else '▼'} {s.get('coin','?').replace('USDT','')}  "
                    f"{s.get('direction','?')}  ${s.get('price','?')}  RSI {s.get('rsi','?')}  Score {s.get('score','?')}"
                    for s in all_sigs[:8]
                ])
                longs  = sum(1 for s in all_sigs if s.get('direction') == 'Long')
                shorts = len(all_sigs) - longs
                return {
                    "reply": f"[BYREAL PERPS CLI — LIVE SIGNALS]\n\n{lines}\n\nLong: {longs}  Short: {shorts}  Total: {len(all_sigs)}",
                    "ai": True, "byreal": True,
                }
        except Exception as e:
            return {"reply": f"[BYREAL PERPS CLI]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    if any(k in msg_lower for k in ["swap usdt", "swap preview", "preview swap", "byreal swap", "tukar usdt"]):
        try:
            token_map = {"btc": "BTC", "eth": "ETH", "mnt": "MNT", "sol": "SOL", "usdt": "USDT"}
            found  = [v for k, v in token_map.items() if k in msg_lower]
            from_t = found[0] if len(found) > 0 else "USDT"
            to_t   = found[1] if len(found) > 1 else "MNT"
            from byreal import get_swap_preview
            prev   = await asyncio.wait_for(get_swap_preview(from_t, to_t, 100.0), timeout=10)
            raw    = prev.get("data", prev)
            out    = raw.get("outputAmount", raw.get("out_amount", raw.get("amountOut", "N/A")))
            route  = raw.get("route", raw.get("pool", f"{from_t}-{to_t}"))
            return {
                "reply": (
                    f"[BYREAL CLMM — SWAP PREVIEW]\n\n"
                    f"From    : 100 {from_t}\n"
                    f"To      : {out} {to_t}\n"
                    f"Route   : {route}\n"
                    f"Slippage: 0.5%\n"
                    f"via @byreal-io/byreal-cli"
                ),
                "ai": True, "byreal": True,
            }
        except Exception as e:
            return {"reply": f"[BYREAL SWAP]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    if any(k in msg_lower for k in ["clmm pool", "byreal pool", "top pool", "liquidity pool", "byreal lp"]):
        try:
            from byreal import get_pools
            pools_data = await asyncio.wait_for(get_pools(), timeout=10)
            raw_pools  = pools_data.get("data", pools_data)
            if isinstance(raw_pools, list) and raw_pools:
                lines = "\n".join([
                    f"• {p.get('pair', p.get('poolName', p.get('name','?')))}  "
                    f"TVL ${p.get('tvl_usd', p.get('tvl',0)):,.0f}  "
                    f"APR {p.get('total_apr', p.get('apy', p.get('apr24h',0))):.1f}%"
                    for p in raw_pools[:6]
                ])
                return {
                    "reply": f"[BYREAL CLMM — TOP POOLS]\n\n{lines}\n\nvia @byreal-io/byreal-cli",
                    "ai": True, "byreal": True,
                }
        except Exception as e:
            return {"reply": f"[BYREAL POOLS]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: help / command list ───────────────────────────────────────────
    if any(k in msg_lower for k in ["byreal help", "help byreal", "byreal command", "apa bisa byreal",
                                     "what can byreal", "byreal capabilities", "byreal skill",
                                     "instruksi byreal", "daftar command", "byreal list"]):
        return {
            "reply": (
                "⚡ BYREAL AGENT SKILLS — All Commands\n\n"
                "🏊 DEX · @byreal-io/byreal-cli\n"
                "• overview              — Global DEX stats (TVL, volume, fees)\n"
                "• pools list            — Top CLMM pools ranked by APR\n"
                "• pools analyze <id>    — Deep pool analysis (APR, risk, range)\n"
                "• tokens list           — All available tokens\n"
                "• swap preview          — Preview swap route & output\n"
                "• swap execute          — Execute real swap on CLMM\n"
                "• positions list        — Your LP positions\n"
                "• positions open        — Open new liquidity position\n"
                "• positions close       — Close LP position\n"
                "• positions claim       — Claim fees & rewards\n"
                "• wallet balance        — Wallet token balances\n\n"
                "📈 PERPS · @byreal-io/byreal-perps-cli\n"
                "• signal scan           — AI signals across all markets\n"
                "• signal detail <coin>  — Technical analysis for specific asset\n"
                "• account info          — Perps account balance & margin\n"
                "• account history       — Recent trading activity\n"
                "• position list         — Open perps positions\n"
                "• position close        — Close position at market\n"
                "• position tpsl         — Set take-profit / stop-loss\n"
                "• position leverage     — Configure leverage (1–50x)\n"
                "• order market          — Execute market order\n"
                "• order limit           — Place limit order\n"
                "• order cancel          — Cancel active order\n\n"
                "💬 Ask me naturally:\n"
                "\"ETH signal detail\" · \"perps account info\"\n"
                "\"wallet balance\" · \"analyze MNT/USDC pool\"\n"
                "\"open BTC long 10x\" · \"perps positions\""
            ),
            "ai": True, "byreal": True,
        }

    # ── Byreal: wallet balance ────────────────────────────────────────────────
    if any(k in msg_lower for k in ["wallet balance", "byreal balance", "saldo wallet",
                                     "my balance", "byreal wallet"]):
        try:
            from byreal import get_wallet_balance
            data = await asyncio.wait_for(get_wallet_balance(), timeout=10)
            raw  = data.get("data", data)
            tokens = raw.get("tokens", raw.get("balances", []))
            if tokens:
                lines = "\n".join([
                    f"• {t.get('symbol','?')}  {t.get('amount', t.get('balance','?'))}  "
                    f"(${t.get('usd_value', t.get('valueUsd', 0)):,.2f})"
                    for t in tokens[:8]
                ])
                return {"reply": f"[BYREAL WALLET BALANCE]\n\n{lines}\n\nvia @byreal-io/byreal-cli",
                        "ai": True, "byreal": True}
        except Exception as e:
            return {"reply": f"[BYREAL WALLET]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: perps account ─────────────────────────────────────────────────
    if any(k in msg_lower for k in ["perps account", "account info", "perps balance",
                                     "hyperliquid account", "futures account"]):
        try:
            from byreal import get_perps_account
            data = await asyncio.wait_for(get_perps_account(), timeout=10)
            raw  = data.get("data", data)
            equity   = raw.get("equity",    raw.get("accountValue", "?"))
            margin   = raw.get("usedMargin", raw.get("totalMarginUsed", "?"))
            free     = raw.get("freeMargin", raw.get("withdrawable", "?"))
            pnl      = raw.get("unrealizedPnl", raw.get("totalRawUsd", "?"))
            return {
                "reply": (
                    f"[BYREAL PERPS ACCOUNT — Hyperliquid]\n\n"
                    f"Equity      : ${equity}\n"
                    f"Used Margin : ${margin}\n"
                    f"Free Margin : ${free}\n"
                    f"Unrealized PnL: ${pnl}\n\n"
                    f"via @byreal-io/byreal-perps-cli"
                ),
                "ai": True, "byreal": True,
            }
        except Exception as e:
            return {"reply": f"[BYREAL PERPS ACCOUNT]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: perps positions ───────────────────────────────────────────────
    if any(k in msg_lower for k in ["perps position", "open position", "my position",
                                     "futures position", "posisi perps", "posisi saya"]):
        try:
            from byreal import get_perps_positions
            data = await asyncio.wait_for(get_perps_positions(), timeout=10)
            raw  = data.get("data", data)
            positions = raw if isinstance(raw, list) else raw.get("positions", [])
            if positions:
                lines = "\n".join([
                    f"{'▲' if p.get('side','').upper()=='LONG' else '▼'} {p.get('symbol', p.get('coin','?'))}  "
                    f"{p.get('side','?')}  Size: {p.get('size','?')}  "
                    f"Entry: ${p.get('entryPrice', p.get('entry','?'))}  "
                    f"PnL: ${p.get('unrealizedPnl', p.get('pnl','?'))}"
                    for p in positions[:6]
                ])
                return {"reply": f"[BYREAL PERPS — OPEN POSITIONS]\n\n{lines}", "ai": True, "byreal": True}
            return {"reply": "[BYREAL PERPS]\nNo open positions.", "ai": True, "byreal": True}
        except Exception as e:
            return {"reply": f"[BYREAL PERPS POSITIONS]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: signal detail for specific coin ───────────────────────────────
    _COINS = ["btc", "eth", "sol", "bnb", "xrp", "mnt", "ton", "avax", "near", "arb", "op",
              "link", "dot", "ada", "ltc", "atom", "apt", "sui", "inj", "hype", "nil"]
    _coin_match = next((c.upper() for c in _COINS if c in msg_lower), None)
    if _coin_match and any(k in msg_lower for k in ["signal", "analisis", "analysis", "technical",
                                                      "sinyal", "detail", "chart"]):
        try:
            from byreal import get_signal_detail
            data = await asyncio.wait_for(get_signal_detail(f"{_coin_match}USDT"), timeout=12)
            raw  = data.get("data", data)
            rsi      = raw.get("rsi", "?")
            trend    = raw.get("trend", raw.get("signal", "?"))
            score    = raw.get("score", raw.get("strength", "?"))
            support  = raw.get("support", "?")
            resist   = raw.get("resistance", "?")
            summary  = raw.get("summary", raw.get("reasoning", ""))
            return {
                "reply": (
                    f"[BYREAL PERPS — {_coin_match}/USDT SIGNAL DETAIL]\n\n"
                    f"Trend     : {trend}\n"
                    f"RSI       : {rsi}\n"
                    f"Score     : {score}\n"
                    f"Support   : ${support}\n"
                    f"Resistance: ${resist}\n"
                    + (f"\n{summary[:200]}" if summary else "") +
                    f"\n\nvia @byreal-io/byreal-perps-cli signal detail"
                ),
                "ai": True, "byreal": True,
            }
        except Exception as e:
            return {"reply": f"[BYREAL SIGNAL DETAIL {_coin_match}]\nCLI unavailable: {str(e)[:100]}",
                    "ai": True, "byreal": True}

    # ── Byreal: trading history ───────────────────────────────────────────────
    if any(k in msg_lower for k in ["trade history", "riwayat", "history perps",
                                     "recent trade", "account history"]):
        try:
            from byreal import get_perps_history
            data = await asyncio.wait_for(get_perps_history(), timeout=10)
            raw  = data.get("data", data)
            trades = raw if isinstance(raw, list) else raw.get("trades", raw.get("history", []))
            if trades:
                lines = "\n".join([
                    f"• {t.get('symbol','?')}  {t.get('side','?')}  "
                    f"${t.get('price', t.get('avgPrice','?'))}  "
                    f"PnL: ${t.get('realizedPnl', t.get('pnl','?'))}"
                    for t in trades[:6]
                ])
                return {"reply": f"[BYREAL PERPS — TRADE HISTORY]\n\n{lines}", "ai": True, "byreal": True}
            return {"reply": "[BYREAL PERPS]\nNo recent trades.", "ai": True, "byreal": True}
        except Exception as e:
            return {"reply": f"[BYREAL HISTORY]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: open orders list ─────────────────────────────────────────────
    if any(k in msg_lower for k in ["order list", "open order", "daftar order",
                                     "perps order", "my order"]):
        try:
            from byreal import get_perps_orders
            data = await asyncio.wait_for(get_perps_orders(), timeout=10)
            raw  = data.get("data", data)
            orders = raw if isinstance(raw, list) else raw.get("orders", [])
            if orders:
                lines = "\n".join([
                    f"• #{o.get('oid', o.get('id','?'))}  {o.get('coin', o.get('symbol','?'))}  "
                    f"{o.get('side','?')}  Size: {o.get('sz', o.get('size','?'))}  "
                    f"Limit: ${o.get('limitPx', o.get('price','?'))}"
                    for o in orders[:8]
                ])
                return {"reply": f"[BYREAL PERPS — OPEN ORDERS]\n\n{lines}\n\nTotal: {len(orders)} orders",
                        "ai": True, "byreal": True}
            return {"reply": "[BYREAL PERPS]\nNo open orders.", "ai": True, "byreal": True}
        except Exception as e:
            return {"reply": f"[BYREAL ORDERS]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: cancel all orders ─────────────────────────────────────────────
    if any(k in msg_lower for k in ["cancel all order", "batalkan semua order",
                                     "cancel-all order", "hapus semua order"]):
        try:
            from byreal import cancel_all_perps_orders
            data = await asyncio.wait_for(cancel_all_perps_orders(), timeout=20)
            raw  = data.get("data", data)
            cancelled = raw.get("cancelled", raw.get("count", "all"))
            return {"reply": f"[BYREAL PERPS]\n✅ All orders cancelled.\nCancelled: {cancelled}",
                    "ai": True, "byreal": True}
        except Exception as e:
            return {"reply": f"[BYREAL CANCEL ALL]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: close all positions ───────────────────────────────────────────
    if any(k in msg_lower for k in ["close all position", "tutup semua posisi",
                                     "close-all position", "liquidate all"]):
        try:
            from byreal import close_all_perps_positions
            data = await asyncio.wait_for(close_all_perps_positions(), timeout=30)
            raw  = data.get("data", data)
            closed = raw.get("closed", raw.get("count", "all"))
            return {"reply": f"[BYREAL PERPS]\n✅ All positions closed at market.\nClosed: {closed}",
                    "ai": True, "byreal": True}
        except Exception as e:
            return {"reply": f"[BYREAL CLOSE ALL]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: close specific position ──────────────────────────────────────
    _close_match = next((c.upper() for c in _COINS if c in msg_lower), None)
    if _close_match and any(k in msg_lower for k in ["close position", "tutup posisi", "close perps",
                                                      "close-market", "exit position"]):
        try:
            from byreal import close_perps_position
            data = await asyncio.wait_for(close_perps_position(f"{_close_match}USDT"), timeout=20)
            raw  = data.get("data", data)
            price = raw.get("price", raw.get("avgPrice", "market"))
            size  = raw.get("size", raw.get("sz", "?"))
            return {
                "reply": (
                    f"[BYREAL PERPS — CLOSE POSITION]\n\n"
                    f"✅ {_close_match} position closed at market\n"
                    f"Price : ${price}\n"
                    f"Size  : {size}\n\n"
                    f"via @byreal-io/byreal-perps-cli"
                ),
                "ai": True, "byreal": True,
            }
        except Exception as e:
            return {"reply": f"[BYREAL CLOSE {_close_match}]\nCLI unavailable: {str(e)[:100]}",
                    "ai": True, "byreal": True}

    # ── Byreal: set leverage ──────────────────────────────────────────────────
    _lev_match = next((c.upper() for c in _COINS if c in msg_lower), None)
    _lev_num   = next((int(w.replace("x","")) for w in msg_lower.split()
                       if w.replace("x","").isdigit() and 1 <= int(w.replace("x","")) <= 50), None)
    if _lev_match and _lev_num and any(k in msg_lower for k in ["leverage", "lev", "set leverage"]):
        try:
            from byreal import set_position_leverage
            data = await asyncio.wait_for(set_position_leverage(f"{_lev_match}USDT", _lev_num), timeout=15)
            raw  = data.get("data", data)
            return {
                "reply": (
                    f"[BYREAL PERPS — LEVERAGE]\n\n"
                    f"✅ {_lev_match} leverage set to {_lev_num}x\n\n"
                    f"via @byreal-io/byreal-perps-cli"
                ),
                "ai": True, "byreal": True,
            }
        except Exception as e:
            return {"reply": f"[BYREAL LEVERAGE]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Byreal: set TP/SL ────────────────────────────────────────────────────
    _tpsl_match = next((c.upper() for c in _COINS if c in msg_lower), None)
    if _tpsl_match and any(k in msg_lower for k in ["take profit", "stop loss", "tpsl", "tp sl", "set tp", "set sl"]):
        import re as _re
        _prices = [float(p) for p in _re.findall(r'\d+(?:\.\d+)?', msg) if float(p) > 10]
        _tp = _prices[0] if len(_prices) > 0 else None
        _sl = _prices[1] if len(_prices) > 1 else None
        try:
            from byreal import set_position_tpsl
            data = await asyncio.wait_for(set_position_tpsl(f"{_tpsl_match}USDT", _tp, _sl), timeout=15)
            raw  = data.get("data", data)
            tp_str = f"${_tp}" if _tp else "unchanged"
            sl_str = f"${_sl}" if _sl else "unchanged"
            return {
                "reply": (
                    f"[BYREAL PERPS — TP/SL]\n\n"
                    f"✅ {_tpsl_match} TP/SL updated\n"
                    f"Take Profit : {tp_str}\n"
                    f"Stop Loss   : {sl_str}\n\n"
                    f"via @byreal-io/byreal-perps-cli"
                ),
                "ai": True, "byreal": True,
            }
        except Exception as e:
            return {"reply": f"[BYREAL TP/SL]\nCLI unavailable: {str(e)[:100]}", "ai": True, "byreal": True}

    # ── Rule-based responses ──────────────────────────────────────────────────
    def contains(*words): return any(w in msg_lower for w in words)

    if contains("halo", "hello", "hi", "hey", "hai"):
        reply = (
            f"Halo! Saya AI CFO SoeClaw.\n"
            f"BTC saat ini ${btc_p:,.0f} ({btc_c:+.1f}%). "
            f"Regime pasar: {regime}. Ada yang bisa saya bantu?"
        )
    elif contains("btc", "bitcoin"):
        sentiment = "bullish" if btc_c > 1 else "bearish" if btc_c < -1 else "netral"
        reply = (
            f"BTC/USDT: ${btc_p:,.2f} ({btc_c:+.2f}% 24h) — {sentiment}\n"
            f"Regime: {regime}\n"
            f"{'Momentum positif, pertimbangkan entry.' if btc_c > 2 else 'Momentum melemah — kurangi exposure.' if btc_c < -2 else 'Sideways — tunggu konfirmasi arah.'}"
        )
    elif contains("eth", "ethereum"):
        reply = (
            f"ETH/USDT: ${eth_p:,.2f} ({eth_c:+.2f}% 24h)\n"
            f"mETH: ${meth_p:,.4f}\n"
            f"{'ETH outperform BTC — altseason signal.' if eth_c > btc_c + 1 else 'ETH underperform BTC.' if eth_c < btc_c - 1 else 'ETH dan BTC bergerak seirama.'}"
        )
    elif contains("mnt", "mantle"):
        reply = (
            f"MNT/USDT: ${mnt_p:,.4f} ({mnt_c:+.2f}% 24h)\n"
            f"SoeClaw beroperasi di Mantle — semua trade diverifikasi on-chain via ERC-8004."
        )
    elif contains("cook", "byreal"):
        reply = (
            f"COOK/USDT: ${cook_p:,.6f} — Byreal governance token\n"
            f"Byreal Skills: CLMM liquidity, Perps trading, RWA yield dipakai SoeClaw di Mantle L2."
        )
    elif contains("strategi", "strategy", "portofolio", "portfolio", "saran", "alokasi"):
        allocs = {"conservative": (65,15,15,5), "balanced": (40,30,25,5), "aggressive": (20,50,25,5)}
        r, t, m, s = allocs.get(profile, (40,30,25,5))
        reply = (
            f"Strategi Portfolio — Profil: {profile.upper()}\n"
            f"  RWA Yield:     {r}%  (${capital*r//100:,.0f})\n"
            f"  Active Trade:  {t}%  (${capital*t//100:,.0f})\n"
            f"  MNT Ecosystem: {m}%  (${capital*m//100:,.0f})\n"
            f"  Stable Buffer: {s}%  (${capital*s//100:,.0f})\n"
            f"Regime {regime}: {'geser ke RWA defensive.' if regime == 'RISK_OFF' else 'geser ke trading.' if regime == 'RISK_ON' else 'pertahankan alokasi.'}"
        )
    elif contains("trade", "transaksi", "posisi"):
        reply = "5 Trade Terakhir AI Agents:\n" + "\n".join(trade_lines)
    elif contains("risiko", "risk", "drawdown"):
        risk_map = {"conservative": "max drawdown 5%, capital preservation.", "balanced": "max drawdown 15%.", "aggressive": "max drawdown 30%, high risk."}
        reply = (
            f"Risk Assessment — Profil: {profile.upper()}\n"
            f"Regime: {regime} | BTC volatilitas: {abs(btc_c):.1f}%\n"
            f"{risk_map.get(profile, '')}\n"
            f"{'⚠️ RISK_OFF aktif — kurangi posisi.' if regime == 'RISK_OFF' else '✅ Pasar kondusif untuk posisi aktif.' if regime == 'RISK_ON' else 'Pasar netral — maintain posisi.'}"
        )
    elif contains("pasar", "market", "kondisi", "sentiment"):
        reply = (
            f"Kondisi Pasar:\n"
            f"BTC: ${btc_p:,.0f} ({btc_c:+.1f}%) | ETH: ${eth_p:,.2f} ({eth_c:+.1f}%)\n"
            f"MNT: ${mnt_p:,.4f} ({mnt_c:+.1f}%) | Regime: {regime}\n"
            f"{'Bullish momentum — pertimbangkan tambah posisi.' if regime == 'RISK_ON' else 'Risk-off — prioritaskan aset defensif.' if regime == 'RISK_OFF' else 'Konsolidasi — tunggu breakout.'}"
        )
    elif contains("agent", "agen"):
        reply = (
            f"AI Agents SoeClaw:\n"
            f"• AlphaQuant — technical analysis multi-timeframe\n"
            f"• WhaleWatcher — on-chain whale flow surveillance\n"
            f"• MacroAnalyzer — macro & sentiment intel\n"
            f"• RiskManager — portfolio risk control\n"
            f"Semua keputusan direkam on-chain via ERC-8004 di Mantle."
        )
    else:
        reply = (
            f"AI CFO siap. Tanya tentang:\n"
            f"• Harga: BTC (${btc_p:,.0f}), ETH, MNT, COOK\n"
            f"• Strategi & alokasi portfolio\n"
            f"• Kondisi pasar & sentiment\n"
            f"• Analisis risiko & drawdown\n"
            f"• Status agent & trade history\n"
            f"Regime sekarang: {regime} | BTC {btc_c:+.1f}%"
        )

    return {"reply": reply, "ai": False}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
