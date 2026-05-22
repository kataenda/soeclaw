import asyncio
import json
import random
import sys
import os
import time
import ssl
import httpx
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import database
import models
from strategies import get_strategy_signal
from backtesting import run_backtest
from auth import hash_password, verify_password, create_token, get_current_user
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    """Fetch real market prices from CoinGecko (fallback from Bybit when not connected)."""
    global _last_price_fetch
    if _bybit_connected:
        return  # Bybit WebSocket is live — skip polling
    now = time.time()
    if now - _last_price_fetch < 10:
        return  # use cache (10s interval)

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


@app.get("/api/backtest/{symbol}")
async def backtest(symbol: str):
    """Run 7-day backtest for all agents on a given symbol."""
    sym = symbol.replace("-", "/").upper()
    if sym not in price_cache:
        return {"error": f"Unknown symbol {sym}. Use BTC-USDT, ETH-USDT, or MNT-USDT"}
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


async def agent_loop():
    global _agent_idx

    # Warm up prices before first tick
    await fetch_prices()
    await manager.broadcast({"type": "PRICE_UPDATE", "data": price_cache})

    while True:
        await asyncio.sleep(60)  # 1 menit — hemat gas testnet

        if not agent_running:
            continue  # skip tick tapi tetap loop (harga masih update)

        # Refresh prices (fetch_prices caches internally for 30s)
        await fetch_prices()
        # Always append current cached prices to history (even if fetch failed)
        for sym in price_history:
            p = price_cache[sym]["price"]
            if p > 0:
                price_history[sym] = (price_history[sym] + [p])[-50:]
        await manager.broadcast({"type": "PRICE_UPDATE", "data": price_cache})

        # Pick rotating agent and a random symbol
        agent_cfg = AGENT_CONFIGS[_agent_idx % len(AGENT_CONFIGS)]
        _agent_idx += 1
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
                tx_hash = mantle_client.log_trade_on_chain(agent_cfg["name"], symbol, action, confidence)
                trade = models.Trade(
                    agent_id=(_agent_idx % len(AGENT_CONFIGS)) + 1,
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
        finally:
            db.close()


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(bybit_ws_loop())  # real-time prices from Bybit
    asyncio.create_task(agent_loop())     # AI trading loop


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
