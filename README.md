# SoeClaw — Autonomous AI Trading Platform on Mantle

> AI agents that analyze real markets, make intelligent trading decisions, and log every trade permanently on the Mantle blockchain.

**Live Demo:** [soeclaw.vercel.app](https://soeclaw.vercel.app) *(coming soon)*  
**Contract (Mantle Sepolia):** `0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8`  
**Explorer:** [explorer.sepolia.mantle.xyz](https://explorer.sepolia.mantle.xyz)  
**Track:** Alpha & Data Track — Path B (AI-Driven Trading Strategy)

---

## What is SoeClaw?

SoeClaw is a fully autonomous AI trading system where multiple specialized AI agents continuously analyze live crypto markets and execute verifiable trades on the Mantle blockchain. Every decision is powered by Claude AI (Anthropic), every trade is recorded on-chain, and all activity streams live to a real-time cyberpunk dashboard.

**Key differentiators:**
- Real market prices from CoinGecko (BTC, ETH, MNT)
- 4 AI agents with distinct strategies (Momentum, Mean-Reversion, Trend, Volatility)
- Built-in backtesting engine with performance metrics
- Every trade logged on Mantle via `addTrade()` smart contract call
- On-chain agent reputation system via `getAgentReputation()`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                     │
│  React 19 + TypeScript + Vite + Recharts                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │MarketChart│ │Positions │ │Leaderboard│ │TerminalConsole│  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │ WebSocket (wss://) + REST
┌───────────────────────▼─────────────────────────────────────┐
│                     BACKEND (Railway)                        │
│  FastAPI + SQLite + asyncio                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Agent Loop (every 10s)                      │ │
│  │  fetch_prices() → get_ai_decision() → broadcast()       │ │
│  │                                                          │ │
│  │  Strategies: Momentum | MeanReversion | Trend | Volatility│ │
│  │  AI Engine:  Claude Haiku (Anthropic API)               │ │
│  │  Backtesting: 7-day historical data via CoinGecko       │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        │ Web3.py
┌───────────────────────▼─────────────────────────────────────┐
│               MANTLE SEPOLIA TESTNET (Chain ID 5003)         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  SoeClaw.sol                                             │ │
│  │  addTrade(agentName, symbol, action, confidence)         │ │
│  │  triggerAgent(agentName)                                 │ │
│  │  getAgentReputation(agentName) → uint256                 │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts |
| Backend | FastAPI, SQLAlchemy, SQLite, asyncio |
| AI Engine | Anthropic Claude Haiku |
| Market Data | CoinGecko API (free, real-time) |
| Blockchain | Web3.py, Mantle Sepolia Testnet |
| Smart Contract | Solidity 0.8.20, Hardhat |
| Deployment | Vercel (frontend), Railway (backend) |

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- A wallet private key (Mantle Sepolia)
- Anthropic API key → [console.anthropic.com](https://console.anthropic.com)

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/soeclaw.git
cd soeclaw

# Copy env template and fill in your keys
cp .env.example backend/.env
```

Edit `backend/.env`:
```env
PRIVATE_KEY=your_wallet_private_key_without_0x
MANTLE_CONTRACT_ADDRESS=0x...   # after deploying smart contract
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Run backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# → http://localhost:8000
```

### 3. Run frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 4. Deploy smart contract (requires testnet MNT)

Get testnet MNT: [faucet.sepolia.mantle.xyz](https://faucet.sepolia.mantle.xyz)

```bash
cd smart-contract
npm install
npx hardhat run scripts/deploy.js --network mantleTestnet
# Copy the deployed address → backend/.env MANTLE_CONTRACT_ADDRESS
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/market` | GET | Live prices: BTC, ETH, MNT |
| `/api/agents` | GET | Agent list with performance metrics |
| `/api/trades` | GET | Last 50 trades with tx hashes |
| `/api/thought-stream` | GET | Last 100 agent decisions |
| `/api/wallet` | GET | Wallet address + MNT balance from chain |
| `/api/backtest/{symbol}` | GET | 7-day backtest results per strategy |
| `/ws` | WebSocket | Real-time stream: PRICE_UPDATE, THOUGHT, TRADE |

---

## AI Agent Strategies

| Agent | Strategy | Logic |
|---|---|---|
| AlphaQuant | Momentum | Buys when upward momentum detected, sells on reversal |
| WhaleWatcher | Mean-Reversion | Buys oversold conditions, sells overbought |
| RiskManager | Volatility-Adjusted | Scales conviction by volatility regime |
| MacroAnalyzer | Trend-Following | Follows 7-day trend direction with pullback entries |

All strategies are backtested against 7 days of hourly CoinGecko data before each session. Results (win rate, ROI, Sharpe ratio) are visible in the leaderboard.

---

## Smart Contract

**Contract:** `SoeClaw.sol`  
**Network:** Mantle Sepolia Testnet (Chain ID: 5003)  
**Address:** `TBD`  

Key functions:
```solidity
// Log a trade on-chain (called by AI agent on every BUY/SELL)
function addTrade(string agentName, string symbol, string action, uint256 confidence)

// AI-callable trigger function (satisfies on-chain AI requirement)
function triggerAgent(string agentName)

// View agent's on-chain reputation score
function getAgentReputation(string agentName) → uint256
```

---

## Deployed Addresses

| Network | Contract | Address |
|---|---|---|
| Mantle Sepolia Testnet | SoeClaw.sol | [`0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8`](https://explorer.sepolia.mantle.xyz/address/0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8) |

*Update this table after deployment.*

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | Yes | Wallet private key (no 0x prefix) |
| `MANTLE_CONTRACT_ADDRESS` | Yes | Deployed SoeClaw contract address |
| `ANTHROPIC_API_KEY` | Recommended | Claude API key for real AI decisions |
| `MANTLE_EXPLORER_API_KEY` | Optional | For contract verification |

### Frontend (`.env.production`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend URL |
| `VITE_WS_URL` | `ws://localhost:8000` | WebSocket URL |

---

## Submission Info (Alpha & Data Track)

**Data sources:** CoinGecko real-time API (BTC/USDT, ETH/USDT, MNT/USDT prices + 24h change + 7-day historical for backtesting)

**AI role:** Claude Haiku analyzes current price, 24h momentum, and strategy-specific signals to generate BUY/SELL/HOLD decisions with confidence scores and written reasoning — broadcast live to the terminal UI

**Verifiable value on Mantle:** Every non-HOLD decision triggers `addTrade()` on the SoeClaw smart contract, creating a permanent, publicly verifiable on-chain record. Agent reputation scores accumulate on-chain via `getAgentReputation()`. All tx hashes are linked to the Mantle Sepolia explorer in the live dashboard.

---

## License

MIT
