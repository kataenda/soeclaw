---
name: soeclaw-ai-cfo
description: SoeClaw AI CFO — autonomous crypto trading agent on Mantle L2. Use when user wants AI-powered portfolio analysis, ERC-8004 on-chain trade verification, Byreal perps signals, or Mantle ecosystem insights.
metadata:
  openclaw:
    homepage: https://github.com/kataenda/soeclaw
    requires:
      network: mantle-mainnet
    contracts:
      SoeClaw: "0xaDe0cE7d778D5050360221810ae814DAF9f6AFe8"
      AgentIdentityRegistry: "0x389DF777f009d32c4B6451F159c763c7f9d15803"
    agents:
      - AlphaQuant
      - WhaleWatcher
      - MacroAnalyzer
      - RiskManager
---

# SoeClaw AI CFO

Autonomous AI trading platform on Mantle L2 with ERC-8004 on-chain identity verification. Every agent decision is permanently recorded on Mantle blockchain as an ERC-8004 proof.

## What SoeClaw Does

- **Signal-driven trading** — uses byreal-perps-cli signal scan as primary decision engine
- **ERC-8004 identity** — each AI agent has an on-chain identity (NFT) with reputation score
- **On-chain proof** — every BUY/SELL/HOLD is recorded on Mantle mainnet (Chain ID 5000)
- **CFO chat** — natural language interface for market analysis and Byreal CLI commands
- **Alpha scorecard** — tracks AI portfolio vs BTC baseline, sharpe ratio, win rate

## API Endpoints

```
GET  /api/agent/status          — Agent running state
POST /api/agent/start           — Start trading loop
POST /api/agent/stop            — Stop + close all Byreal positions
GET  /api/trades                — Recent on-chain trades
GET  /api/cfo/health            — Market health score (0–100) + regime
GET  /api/cfo/alpha-scorecard   — Alpha vs BTC, win rate, sharpe ratio
POST /api/cfo/chat              — CFO natural language chat
GET  /api/skills                — List registered agent skills
GET  /api/skills/{name}         — Fetch SKILL.md for a skill
```

## CFO Chat

POST `/api/cfo/chat` with JSON:
```json
{
  "message": "What is the BTC signal?",
  "wallet_address": "0x...",
  "wallet_balance_mnt": 1.5,
  "history": []
}
```

Supports:
- Market analysis: "BTC signal detail", "perps signals"
- Byreal DEX: "wallet balance", "top pools", "swap USDT → MNT"
- Byreal Perps: "account info", "perps positions", "close BTC"
- Agent control: "stop agent", "start agent"
- Portfolio: "alpha scorecard", "win rate", "health score"

## ERC-8004 Agents

| Agent | Token ID | Specialty | Signal Category |
|---|---|---|---|
| AlphaQuant | 0 | Momentum + technical | moderate |
| WhaleWatcher | 1 | Volume + whale tracking | aggressive |
| MacroAnalyzer | 2 | Macro + sentiment | conservative |
| RiskManager | 3 | Risk-adjusted returns | conservative |

## Execution Rules

1. Agent decisions come from byreal-perps-cli signal scan (score, RSI, direction)
2. Order size = $10 USD / current price (coin units), leverage 5x, SL 3%
3. All decisions recorded on Mantle via `log_trade_on_chain(agent, symbol, action, confidence)`
4. STOP command closes all Byreal positions + cancels orders before halting loop

## Networks

- Mantle Mainnet (Chain ID 5000) — RPC: https://rpc.mantle.xyz
- Explorer: https://explorer.mantle.xyz
- Byreal Perps: Hyperliquid via byreal-perps-cli
- Byreal DEX: Solana CLMM via byreal-cli
