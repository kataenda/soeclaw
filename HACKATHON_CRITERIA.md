# Mantle AI Hackathon — Judging Criteria & Gap Analysis
> Project: **SoeClaw OS** | Date: 2026-05-23

---

## Grand Champion

| Dimension | Weight | Status | Notes |
|---|---|---|---|
| Technical Depth | 30% | ✅ | AI × on-chain: 4 quant agents + ERC-8004 identity + on-chain trade recording |
| Innovation | 25% | ✅ | Autonomous multi-agent trading with on-chain identity (ERC-8004) — novel paradigm |
| Mantle Ecosystem Contribution | 25% | ✅ | Mantle Sepolia deploy, MNT balance, ERC-8004 registry, USDY+mETH RWA |
| Product Completeness | 20% | ⚠️ | Demo runnable locally; **needs public deployment** |

**Requirements:**
- [ ] Deployed on Mantle Network (Testnet ✅, Mainnet ❌)
- [ ] Open-source repo ✅
- [ ] Runnable demo ⚠️ (localhost only, not public URL)
- [ ] Project pitch ❌ (not written yet)
- [ ] Nominated from at least one track ✅

---

## Track 1 — Alpha & Data (Mirana Ventures)

**Winning Path B chosen: AI-Driven Trading Strategy**

| Criterion | Weight | Status | Notes |
|---|---|---|---|
| Data source quality | General 60% | ✅ | CoinGecko prices, on-chain whale tracking, anomaly detector |
| AI analysis depth | | ✅ | 4 strategies: momentum, mean-reversion, trend-following, volatility |
| Technical completeness | | ✅ | FastAPI backend, WebSocket streaming, SQLite history |
| Sustainability | | ✅ | Auto-restart, retry loops, error handling |
| Strategy Alpha | Track 40% | ✅ | Backtesting engine (`backtesting.py`), live trades, ERC-8004 on-chain records |

**Requirements:**
- [x] Mantle on-chain data as core source (ERC-8004 trade registry)
- [x] Deploy on Mantle Network (Testnet)
- [x] Open-source repo
- [ ] Demo + one-line pitch

**One-line pitch:** *"Four autonomous AI quant agents trade BTC/ETH/MNT with verifiable on-chain records via ERC-8004 identity on Mantle Sepolia."*

---

## Track 2 — AI × RWA (Mantle Network)

**Winning Path B chosen: AI-Driven RWA Application**

| Criterion | Weight | Status | Notes |
|---|---|---|---|
| Depth of AI × RWA integration | General 60% | ✅ | Dynamic allocation between USDY (5% APY) and mETH (3.8% APR) |
| Technical completeness | | ✅ | `rwa/yield_tracker.py`, `/api/rwa/yields` endpoint |
| Mantle integration | | ✅ | mETH is native Mantle LSP asset |
| Compliance awareness | | ⚠️ | Mentioned but not deeply implemented |
| Real-World Validity | Track 40% | ✅ | Clear assets (US T-Bills via USDY, ETH staking via mETH), complete UX in RWA tab |

**Requirements:**
- [x] Real World Assets involved (USDY = US Treasury Bills, mETH = staked ETH)
- [x] Deploy on Mantle Network
- [x] Open-source repo
- [ ] Demo + one-line pitch

**One-line pitch:** *"AI dynamically allocates between USDY and mETH RWA assets on Mantle, maximizing yield based on market regime."*

---

## Track 3 — Agentic Economy (Byreal)

**⚠️ CRITICAL GAP**

| Criterion | Status | Notes |
|---|---|---|
| Byreal Agent Skills (CLMM, LP, Swap) | ❌ | We built our own CLI — not the actual Byreal SDK |
| Byreal Perps CLI | ❌ | Not integrated |
| RealClaw agent | ❌ | Not used |

**What we built:** `backend/byreal_cli.py` — a custom CLI that simulates agentic economy concept but does **not** use Byreal's actual on-chain tools.

**What's needed:** Import and call actual `byreal-agent-skills` or `byreal-perps-cli` npm/pip packages.

**Action required:**
- [ ] Install actual Byreal SDK
- [ ] Replace mock CLI with real Byreal calls
- [ ] Or pivot to "RealClaw Real-Life Expansion" path with real RealClaw integration

---

## Best UI/UX Award

| Dimension | Weight | Status | Notes |
|---|---|---|---|
| Visual Design | 30% | ✅ | Cyberpunk dark terminal aesthetic, consistent design tokens |
| Interaction & Flow | 30% | ✅ | Tab navigation, live WebSocket updates, mobile nav |
| AI Interaction Design | 25% | ✅ | AI Thought Stream, real-time agent reasoning visible |
| Accessibility | 15% | ⚠️ | 8 language i18n ✅, but no ARIA labels, no keyboard nav |

**Requirements:**
- [x] Runnable frontend
- [ ] Demo video ❌
- [ ] Publicly accessible link ❌

---

## 20 Project Deployment Award

| Requirement | Status | Notes |
|---|---|---|
| ✅ Smart contract on Mantle Testnet | ✅ | ERC-8004 IdentityRegistry at `0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d` |
| ✅ Contract verified on Mantle Explorer | ❌ | **Not verified yet** |
| ✅ AI-powered function callable on-chain | ✅ | `recordTrade()` called by AI agent on every trade |
| ✅ Frontend publicly accessible | ❌ | **Localhost only — needs deploy (Vercel/Railway)** |
| ✅ Deployment address in DoraHacks | ❌ | Not submitted yet |
| ✅ Demo video ≥ 2 min | ❌ | Not recorded yet |
| ✅ GitHub README with setup + architecture | ⚠️ | README exists but incomplete |

---

## Summary — What's Missing (Priority Order)

| Priority | Action | Impact |
|---|---|---|
| 🔴 HIGH | Deploy frontend to public URL (Vercel/Netlify) | Required for ALL prizes |
| 🔴 HIGH | Verify contract on Mantle Explorer | Required for Deployment Award |
| 🔴 HIGH | Record demo video ≥ 2 min | Required for Deployment Award |
| 🔴 HIGH | Fix Track 3 (Byreal) — use real Byreal SDK | Currently disqualified from this track |
| 🟡 MED | Submit to DoraHacks with all addresses | Required for submission |
| 🟡 MED | Write project pitch (1-line + full description) | Required for all tracks |
| 🟡 MED | Update README (architecture + deployed address) | Required for Deployment Award |
| 🟢 LOW | Add ARIA labels for accessibility | UI/UX award bonus |
| 🟢 LOW | Mainnet deployment (currently Testnet) | Score boost for Grand Champion |
