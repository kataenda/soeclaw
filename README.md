# SoeClaw AI CFO

> Autonomous AI trading agent on Mantle L2 — every decision permanently recorded on-chain via ERC-8004.

**Live Demo:** https://soeclaw.vercel.app  
**Contract (Mantle Mainnet):** `0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8`  
**AgentIdentityRegistry (ERC-8004):** `0x389DF777f009d32c4B6451F159c763c7f9d15803`  
**Chain:** Mantle Mainnet (Chain ID 5000)  
**Explorer:** https://explorer.mantle.xyz/address/0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8

---

## What is SoeClaw?

SoeClaw is a **Personal AI CFO** — an autonomous crypto trading platform built on Mantle L2. Four specialized AI agents continuously scan markets using Byreal Perps CLI signals, make BUY/SELL/HOLD decisions, and record every decision permanently on Mantle blockchain as an ERC-8004 on-chain proof.

Users interact through a natural language CFO chat interface — asking about market conditions, controlling agents, deploying tokens, and monitoring portfolio performance — all without needing DeFi expertise.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Vercel)                  │
│   React + TypeScript · CFO Chat · Live Dashboard    │
└──────────────────┬──────────────────────────────────┘
                   │ REST + WebSocket
┌──────────────────▼──────────────────────────────────┐
│                Backend (Railway)                     │
│   FastAPI · Agent Loop · Oracle · Skills Engine     │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Agent Loop  │  │  CFO Chat    │  │  Deploy    │ │
│  │ 60s ticks   │  │  Claude AI   │  │  ERC-20    │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                 │        │
│  ┌──────▼──────────────────────────────────▼──────┐ │
│  │              Byreal CLI Layer                   │ │
│  │  byreal-perps-cli (signals, orders, positions)  │ │
│  │  byreal-cli (pools, swap, CLMM, wallet)         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │            Mantle Blockchain Layer               │ │
│  │  MantleClient (web3.py) · ERC-8004 Identity     │ │
│  │  SoeClaw.addTrade() · AgentIdentityRegistry     │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## AI Agents

| Agent | Token ID | Specialty | Signal Category |
|---|---|---|---|
| AlphaQuant | 0 | Momentum + technical analysis | Moderate |
| WhaleWatcher | 1 | Volume + whale flow | Aggressive |
| MacroAnalyzer | 2 | Macro + sentiment | Conservative |
| RiskManager | 3 | Risk-adjusted returns | Conservative |

Each agent has an **ERC-8004 on-chain identity** with reputation score that grows with every verified decision.

---

## Key Features

### Signal-Driven Trading
- **Primary engine:** `byreal-perps-cli signal scan` — real Hyperliquid signals (RSI, score, direction)
- Agents pick best signal from their preferred category (aggressive/moderate/conservative)
- Every BUY/SELL decision recorded on Mantle via `SoeClaw.addTrade()` + `AgentIdentityRegistry.recordTrade()`

### ERC-8004 On-Chain Identity
- Each agent holds an ERC-8004 NFT on Mantle mainnet
- Reputation score updates on-chain after every trade
- Permanent, verifiable audit trail — no trust required

### CFO Chat (Natural Language)
```
"perps signals"                     → live Byreal signal scan
"BTC signal detail"                 → technical analysis
"deploy token SOE supply 1000000"   → compile + deploy ERC-20 to Mantle
"start trading"                     → activate all 4 agents
"stop agent"                        → halt + close all positions
"alpha scorecard"                   → win rate, sharpe ratio, P&L
```

### Byreal Skills Integration
- **byreal-perps-cli:** Hyperliquid perpetuals — signals, orders, positions, leverage, TP/SL
- **byreal-cli:** Solana CLMM DEX — pools, swap, LP positions, wallet balance
- **agentskills format:** SoeClaw published as discoverable SKILL.md

### Smart Contract Deployment via Chat
- Type `deploy token <Name> <SYMBOL> supply <amount>` in CFO chat
- Backend compiles Solidity ERC-20 + deploys to Mantle mainnet
- Returns contract address + Mantle explorer link instantly

### Alpha Scorecard
- Portfolio P&L vs BTC baseline
- Win rate + Sharpe ratio
- Market health score (0–100)
- Real Fear & Greed Index integration

---

## On-Chain Integration

### SoeClaw Contract
```solidity
// Every agent decision recorded on-chain
function addTrade(
    string agentName,
    string symbol,
    string action,      // "BUY" / "SELL" / "HOLD"
    uint256 confidence  // 0-100
) external;
```

### AgentIdentityRegistry (ERC-8004)
```solidity
// Agent reputation grows with every verified trade
function recordTrade(uint256 agentId, string agentName, string symbol, string action, uint256 confidence) external;
function updateReputation(uint256 agentId, int256 delta) external;
function getAgentReputation(uint256 agentId) external view returns (int256);
```

### AI Oracle
- Listens for `AIRequested` events on SoeClaw contract
- Runs AI inference → calls `fulfillAIResult()` on-chain
- Closes the loop: on-chain request → AI response → on-chain proof

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, WebSocket |
| Backend | Python 3.10, FastAPI, uvicorn |
| Blockchain | web3.py, Mantle Mainnet (Chain ID 5000) |
| AI | Claude (Anthropic) + rule-based fallback |
| Trading CLI | @byreal-io/byreal-perps-cli, @byreal-io/byreal-cli |
| Database | PostgreSQL (Railway) / SQLite (local) |
| Deployment | Railway (backend), Vercel (frontend) |
| Price Feed | Bybit WebSocket + CoinGecko API |
| Contracts | Solidity 0.8.20, py-solc-x |

---

## Deployed Contracts

| Contract | Address | Network |
|---|---|---|
| SoeClaw | `0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8` | Mantle Mainnet |
| AgentIdentityRegistry (ERC-8004) | `0x389DF777f009d32c4B6451F159c763c7f9d15803` | Mantle Mainnet |

---

## Setup & Run

### Prerequisites
- Node.js 20+, Python 3.10+
- `npm install -g @byreal-io/byreal-perps-cli @byreal-io/byreal-cli`

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in PRIVATE_KEY, AGENT_API_KEY, etc.
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL=http://localhost:8000
npm run dev
```

### Environment Variables

```env
PRIVATE_KEY=your_wallet_private_key
MANTLE_NETWORK=mainnet
MANTLE_CONTRACT_ADDRESS=0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8
IDENTITY_REGISTRY_ADDRESS=0x389DF777f009d32c4B6451F159c763c7f9d15803
AGENT_API_KEY=your_anthropic_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
ALLOWED_ORIGINS=https://soeclaw.vercel.app
```

---

## API Endpoints

```
GET  /api/agent/status        — Agent running state
POST /api/agent/start         — Start trading loop
POST /api/agent/stop          — Stop + close all Byreal positions
GET  /api/trades              — Recent on-chain trades
GET  /api/cfo/health          — Market health score (0–100) + regime
GET  /api/cfo/alpha-scorecard — Alpha vs BTC, win rate, sharpe ratio
POST /api/cfo/chat            — CFO natural language chat
POST /api/deploy/mantle       — Deploy ERC-20 token to Mantle
GET  /api/skills              — List registered agent skills
GET  /api/skills/{name}       — Fetch SKILL.md for a skill
```

---

## Hackathon Tracks

### Agentic Economy Track (Byreal) — Primary
SoeClaw is a **Personal CFO Agent** using:
- `byreal-perps-cli` as primary signal + execution engine
- `byreal-cli` for Solana CLMM DEX operations
- agentskills open format (SKILL.md) for skill composition
- Deployed on Mantle mainnet with full ERC-8004 verification

### Alpha & Data Track (Mirana Ventures)
**[AI-Driven] Trading Strategy:**
- 4 specialized agents with distinct risk profiles
- Every trade verifiable on Mantle explorer
- Alpha scorecard: win rate, Sharpe ratio, P&L vs BTC
- Live backtesting engine

### AI & RWA Track (Mantle Network)
**RWA yield module:**
- AI-driven tokenized asset allocation
- Portfolio rebalancing recorded on Mantle blockchain
- Blended APY tracking across RWA categories

---

## One-Line Pitch

> SoeClaw is an autonomous AI CFO on Mantle L2 — four AI agents trade via Byreal signals, every decision permanently verified on-chain via ERC-8004, controlled entirely through natural language chat.

---

## Links

- **Live Demo:** https://soeclaw.vercel.app
- **GitHub:** https://github.com/kataenda/soeclaw
- **Contract Explorer:** https://explorer.mantle.xyz/address/0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8
- **AgentIdentityRegistry:** https://explorer.mantle.xyz/address/0x389DF777f009d32c4B6451F159c763c7f9d15803
- **SKILL.md:** https://github.com/kataenda/soeclaw/blob/main/SKILL.md
