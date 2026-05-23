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

sys.path.append(os.path.join(os.path.dirname(__file__), 'blockchain'))
from mantle_client import MantleClient

mantle_client = MantleClient()

# Anthropic client (optional — falls back to rule-based if key missing)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
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
    "BTC/USDT": {"price": 105000.0, "change_24h": 0.0},
    "ETH/USDT": {"price": 2500.0, "change_24h": 0.0},
    "MNT/USDT": {"price": 0.65, "change_24h": 0.0},
}
_last_price_fetch: float = 0.0

# Rolling price history per symbol (last 50 ticks) for strategy calculations
price_history: dict[str, list[float]] = {
    "BTC/USDT": [], "ETH/USDT": [], "MNT/USDT": [],
}

AGENT_CONFIGS = [
    {"name": "AlphaQuant",    "specialty": "momentum and technical analysis"},
    {"name": "WhaleWatcher",  "specialty": "on-chain whale flow and order book depth"},
    {"name": "RiskManager",   "specialty": "risk-adjusted returns and volatility management"},
    {"name": "MacroAnalyzer", "specialty": "macroeconomic indicators and market sentiment"},
]

models.Base.metadata.create_all(bind=database.engine)

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
}

_bybit_connected = False


async def bybit_ws_loop():
    """Stream real-time prices from Bybit public WebSocket (no API key needed)."""
    global _bybit_connected
    url = "wss://stream.bybit.com/v5/public/spot"
    subscribe_msg = json.dumps({
        "op": "subscribe",
        "args": ["tickers.BTCUSDT", "tickers.ETHUSDT", "tickers.MNTUSDT"],
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
                    "ids": "bitcoin,ethereum,mantle",
                    "vs_currencies": "usd",
                    "include_24hr_change": "true",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                mapping = {
                    "BTC/USDT": ("bitcoin", 105000.0),
                    "ETH/USDT": ("ethereum", 2500.0),
                    "MNT/USDT": ("mantle", 0.65),
                }
                for symbol, (cg_id, fallback) in mapping.items():
                    coin = data.get(cg_id, {})
                    price_cache[symbol]["price"] = coin.get("usd", fallback)
                    price_cache[symbol]["change_24h"] = round(coin.get("usd_24h_change", 0.0), 2)
                _last_price_fetch = now
                for sym in price_history:
                    p = price_cache[sym]["price"]
                    if p > 0:
                        price_history[sym] = (price_history[sym] + [p])[-50:]
                print(
                    f"[Market] BTC=${price_cache['BTC/USDT']['price']:,.2f} "
                    f"ETH=${price_cache['ETH/USDT']['price']:,.2f} "
                    f"MNT=${price_cache['MNT/USDT']['price']:.4f}"
                )
            else:
                print(f"[Market] CoinGecko returned {resp.status_code}, using cached prices.")
    except Exception as e:
        print(f"[Market] Fetch error: {e} — using cached prices.")


def get_ai_decision(agent_name: str, specialty: str, symbol: str, price: float, change_24h: float):
    """
    Return (action, confidence, reasoning).
    1. Strategy module generates a signal based on price history
    2. Claude refines the reasoning (if API key set)
    """
    history = price_history.get(symbol, [])
    sig = get_strategy_signal(agent_name, history, change_24h)

    if anthropic_client:
        try:
            prompt = (
                f"You are {agent_name}, an autonomous AI crypto trading agent "
                f"specializing in {specialty}.\n\n"
                f"Market data:\n"
                f"- Asset: {symbol} @ ${price:,.4f}\n"
                f"- 24h Change: {change_24h:+.2f}%\n"
                f"- Strategy signal: {sig.action} (confidence {sig.confidence:.0f}%)\n"
                f"- Strategy reasoning: {sig.reasoning}\n\n"
                f"Confirm or refine this signal. Respond ONLY with valid JSON:\n"
                f'{{ "action": "BUY"|"SELL"|"HOLD", "confidence": <60-99>, "reasoning": "<one sentence>" }}'
            )
            msg = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=130,
                messages=[{"role": "user", "content": prompt}],
            )
            text = msg.content[0].text.strip()
            if "```" in text:
                text = text.split("```")[1].replace("json", "").strip()
            result = json.loads(text)
            action = result.get("action", sig.action).upper()
            if action not in ("BUY", "SELL", "HOLD"):
                action = sig.action
            return action, round(float(result.get("confidence", sig.confidence)), 2), result.get("reasoning", sig.reasoning)
        except Exception as e:
            print(f"[AI] Claude error: {e} — using strategy signal.")

    return sig.action, sig.confidence, sig.reasoning


# ── Health check ────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "agent_running": agent_running, "bybit_connected": _bybit_connected}


# ── AI x RWA endpoints ───────────────────────────────────────────────────────

@app.get("/api/rwa/yields")
async def rwa_yields():
    from rwa import get_rwa_yields
    btc_chg = price_cache.get("BTC/USDT", {}).get("change_24h", 0.0)
    return await get_rwa_yields(btc_chg)


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
            "wallet": {"network": "mantle-sepolia", "currency": "MNT"},
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
            "wallet": {"network": "mantle-sepolia", "currency": "MNT"},
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
            "wallet": {"network": "mantle-sepolia", "currency": "MNT"},
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
            "wallet": {"network": "mantle-sepolia", "currency": "MNT"},
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
            "network": "Mantle Sepolia Testnet",
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
        return {"success": False, "error": str(e)}


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


@app.get("/api/byreal/swap/preview")
async def byreal_swap_preview(from_token: str = "SOL", to_token: str = "USDC", amount: float = 1.0):
    """Preview a token swap on Byreal CLMM DEX."""
    try:
        from byreal import get_swap_preview
        return _byreal_wrap(await get_swap_preview(from_token, to_token, amount))
    except Exception as e:
        return {"success": False, "error": str(e)}


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
    if not user or not verify_password(req.password, user.hashed_pw):
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
    result = {
        "address": "N/A",
        "mnt_balance": 0.0,
        "network": "Mantle Sepolia Testnet",
        "chain_id": 5003,
        "connected": False,
    }
    private_key = os.getenv("PRIVATE_KEY", "")
    if not private_key:
        return result

    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider("https://rpc.sepolia.mantle.xyz", request_kwargs={"timeout": 10}))
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
    return {"status": "started"}


@app.post("/api/agent/stop")
async def agent_stop():
    global agent_running
    agent_running = False
    await manager.broadcast({"type": "AGENT_STATUS", "data": {"running": False}})
    return {"status": "stopped"}


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
            "network": "Mantle Sepolia Testnet",
        })
    return result


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

            action, confidence, reasoning = get_ai_decision(
                agent_cfg["name"], agent_cfg["specialty"], symbol, price, change_24h
            )

            thought_msg = {
                "type": "THOUGHT",
                "data": {
                    "agent_name": agent_cfg["name"],
                    "message": (
                        f"[{symbol}] ${price:,.4f} ({change_24h:+.2f}%) → {action} | "
                        f"{reasoning} (Conf: {confidence:.0f}%)"
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

                    explorer_url = f"https://explorer.sepolia.mantle.xyz/tx/{tx_hash}"
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
                else:
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

    # AI Alpha & Data — whale tracker + anomaly detector + Telegram/Discord bots
    try:
        from alpha import start_alpha_system
        asyncio.create_task(start_alpha_system(price_cache, price_history))
    except Exception as e:
        print(f"[Alpha] Failed to start alpha system: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
