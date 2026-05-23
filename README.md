# SoeClaw OS — Autonomous AI Trading Platform on Mantle

> Four autonomous AI agents trade BTC/ETH/MNT with verifiable on-chain records, ERC-8004 identity, real Byreal DEX integration, and dynamic USDY/mETH RWA allocation — all streaming live to a cyberpunk dashboard.

**Live Demo:** [soeclaw.vercel.app](https://soeclaw.vercel.app)  
**Backend:** [soeclaw-production.up.railway.app](https://soeclaw-production.up.railway.app)  
**GitHub:** [github.com/kataenda/soeclaw](https://github.com/kataenda/soeclaw)

---

## Deployed Contracts (Mantle Sepolia Testnet — Chain ID 5003)

| Contract | Address | Explorer |
|---|---|---|
| SoeClaw Trading Engine | [`0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8`](https://explorer.sepolia.mantle.xyz/address/0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8) | Mantle Sepolia |
| ERC-8004 IdentityRegistry | [`0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d`](https://explorer.sepolia.mantle.xyz/address/0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d) | Mantle Sepolia |

---

## Hackathon Tracks

| Track | Approach | Status |
|---|---|---|
| **Alpha & Data** (Mirana Ventures) | 4 AI quant agents + CoinGecko + backtesting engine | ✅ |
| **AI × RWA** (Mantle Network) | Dynamic USDY/mETH allocation by market regime | ✅ |
| **Agentic Economy** (Byreal) | Real `@byreal-io/byreal-cli` + perps signals | ✅ |
| **Best UI/UX** | Cyberpunk terminal, 8 languages, live WebSocket | ✅ |

**One-line pitches:**
- *Alpha & Data:* "Four autonomous AI quant agents trade BTC/ETH/MNT with verifiable on-chain records via ERC-8004 identity on Mantle Sepolia."
- *AI × RWA:* "AI dynamically allocates between USDY (US T-Bills) and mETH (ETH staking) based on real-time market regime detection."
- *Agentic Economy:* "AI agents interact with Byreal's CLMM DEX and Perps markets via the official Byreal SDK, with on-chain skill registration via ERC-8004."

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                          │
│  React 19 + TypeScript + Vite                                     │
│  Tabs: Market | Agents | Positions | Leaderboard | Insights       │
│  Insights: Alpha Feed | RWA Yields | Byreal DEX | DevTools | Economy│
└───────────────────────┬──────────────────────────────────────────┘
                        │ WebSocket (wss://) + REST (https://)
┌───────────────────────▼──────────────────────────────────────────┐
│                     BACKEND (Railway)                             │
│  FastAPI + SQLite + asyncio                                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Agent Loop (every 10s)                                       │  │
│  │   CoinGecko prices → Claude AI decision → broadcast()       │  │
│  │   Strategies: Momentum | MeanReversion | Trend | Volatility  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Alpha & Data Layer                                           │  │
│  │   Whale tracker (Mantle on-chain) | Anomaly detector        │  │
│  │   RSI/volatility signals | Alert dispatcher (Telegram/Discord│  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ RWA Layer                                                    │  │
│  │   USDY (Ondo Finance, US T-Bills, ~5% APY)                  │  │
│  │   mETH (Mantle LSP, ETH staking, ~3.8% APR)                 │  │
│  │   Market-regime-driven allocation                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Byreal SDK Layer (@byreal-io/byreal-cli)                     │  │
│  │   CLMM DEX: overview, pools, tokens, swap preview           │  │
│  │   Perps CLI: AI signals, positions, account                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────┬──────────────────────────────────────────┘
                        │ Web3.py
┌───────────────────────▼──────────────────────────────────────────┐
│               MANTLE SEPOLIA TESTNET (Chain ID 5003)              │
│   SoeClaw.sol    → recordTrade(), triggerAgent()                  │
│   ERC-8004.sol   → registerAgent(), recordTrade(), mintSkillNFT() │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts |
| Backend | FastAPI, SQLAlchemy, SQLite, asyncio |
| AI Engine | Anthropic Claude (claude-haiku-4-5) |
| Market Data | CoinGecko API (free, real-time + 7-day history) |
| Blockchain | Web3.py, Mantle Sepolia Testnet (Chain ID 5003) |
| Smart Contract | Solidity 0.8.20, ERC-8004 agent identity standard |
| DEX Integration | @byreal-io/byreal-cli, @byreal-io/byreal-perps-cli |
| Deployment | Vercel (frontend), Railway (backend) |
| i18n | 8 languages: EN, ID, ZH-CN, JA, KO, AR, FR, ES |

---

## AI Agent Strategies

| Agent | Strategy | Logic |
|---|---|---|
| AlphaQuant | Momentum | Buys on upward momentum, sells on reversal |
| WhaleWatcher | Mean-Reversion | Buys oversold conditions, sells overbought |
| RiskManager | Volatility-Adjusted | Scales conviction by volatility regime |
| MacroAnalyzer | Trend-Following | Follows 7-day trend with pullback entries |

Each agent has an **ERC-8004 on-chain identity** on Mantle Sepolia. Every BUY/SELL decision triggers `recordTrade()` on-chain, creating a permanent verifiable record.

---

## Quick Start (Local)

### Prerequisites
- Python 3.10+
- Node.js 18+
- Anthropic API key → [console.anthropic.com](https://console.anthropic.com)

### 1. Clone & configure

```bash
git clone https://github.com/kataenda/soeclaw.git
cd soeclaw
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
PRIVATE_KEY=your_wallet_private_key_without_0x
MANTLE_CONTRACT_ADDRESS=0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8
IDENTITY_REGISTRY_ADDRESS=0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=generate_with_python_secrets_token_hex_32
```

### 2. Run backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000
```

### 3. Run frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## API Reference

### Core
| Endpoint | Method | Description |
|---|---|---|
| `/api/market` | GET | Live prices: BTC, ETH, MNT |
| `/api/agents` | GET | Agent list with performance metrics |
| `/api/trades` | GET | Last 50 trades with tx hashes |
| `/api/thought-stream` | GET | Last 100 agent decisions |
| `/api/wallet` | GET | Wallet address + MNT balance from chain |
| `/api/backtest/{symbol}` | GET | 7-day backtest results per strategy |
| `/ws` | WebSocket | Real-time: PRICE_UPDATE, THOUGHT, TRADE |

### Alpha & Data
| Endpoint | Description |
|---|---|
| `/api/alpha/alerts` | Live anomaly alerts (whale, RSI, volatility) |
| `/api/alpha/whales` | Recent on-chain whale transfers on Mantle |

### RWA
| Endpoint | Description |
|---|---|
| `/api/rwa/yields` | USDY + mETH yield data + AI allocation recommendation |

### Byreal DEX (Track 3)
| Endpoint | Description |
|---|---|
| `/api/byreal/overview` | CLMM DEX global stats (TVL, volume, fees) |
| `/api/byreal/pools` | Top liquidity pools |
| `/api/byreal/pools/search?q=SOL` | Search pools by token |
| `/api/byreal/tokens` | Token list with prices |
| `/api/byreal/perps/signals` | AI-generated perpetuals signals |
| `/api/byreal/swap/preview` | Preview swap output before execution |

### Agentic Economy
| Endpoint | Description |
|---|---|
| `/api/agents/economy` | Agent balances in MNT |
| `/api/agents/economy/transfer` | Transfer MNT between agents |
| `/api/agents/skills/register` | Register a new agent skill |
| `/api/agents/skills/mint` | Mint skill NFT via ERC-8004 |

---

## Deployment

### Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo → `kataenda/soeclaw`
2. The `railway.json` and `nixpacks.toml` are auto-detected
3. Set environment variables in Railway dashboard:

```
PRIVATE_KEY=...
ANTHROPIC_API_KEY=...
JWT_SECRET=...  (generate: python -c "import secrets; print(secrets.token_hex(32))")
MANTLE_CONTRACT_ADDRESS=0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8
IDENTITY_REGISTRY_ADDRESS=0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d
BYBIT_ENABLED=true
ALLOWED_ORIGINS=https://soeclaw.vercel.app
```

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → Add New Project → Import `kataenda/soeclaw`
2. Set **Root Directory** = `frontend`
3. Set environment variables:

```
VITE_API_URL=https://soeclaw-production.up.railway.app
VITE_WS_URL=wss://soeclaw-production.up.railway.app
```

---

## Smart Contract Functions

```solidity
// SoeClaw.sol — Trade recording
function recordTrade(string agentName, string symbol, string action, uint256 confidence)
function triggerAgent(string agentName)
function getAgentReputation(string agentName) → uint256

// ERC-8004 IdentityRegistry — Agent identity
function registerAgent(address agentAddress, string name, string metadata) → uint256 agentId
function recordTrade(uint256 agentId, string symbol, string action, uint256 amount) → uint256 tradeId
function mintSkillNFT(uint256 agentId, string skillName, string metadata) → uint256 tokenId
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes | Wallet private key (no 0x prefix) |
| `MANTLE_CONTRACT_ADDRESS` | Yes | SoeClaw contract address |
| `IDENTITY_REGISTRY_ADDRESS` | Yes | ERC-8004 registry address |
| `ANTHROPIC_API_KEY` | Recommended | Claude API for real AI decisions |
| `JWT_SECRET` | Yes | Random 32-byte hex for auth tokens |
| `ALLOWED_ORIGINS` | Yes | Frontend URLs (comma-separated) |
| `BYBIT_ENABLED` | Production | Set to `true` to enable Bybit WS |
| `TELEGRAM_BOT_TOKEN` | Optional | For alpha alert notifications |
| `DISCORD_WEBHOOK_URL` | Optional | For alpha alert notifications |
| `WHALE_THRESHOLD_MNT` | Optional | MNT threshold for whale alerts (default: 500) |

### Frontend (`frontend/.env.production`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (https://) |
| `VITE_WS_URL` | Backend WebSocket URL (wss://) |

---

## License

MIT
