"""
RWA (Real World Asset) yield data from DeFiLlama API.
Falls back to reasonable estimates if API unavailable.
"""
import time
import httpx

_CACHE: dict = {}
_CACHE_TS: float = 0.0
_TTL = 1800  # 30 min


class yield_tracker:
    _last_fetch: float = 0.0


# Target pools on DeFiLlama (chain + project filters)
_TARGETS = [
    {"symbol": "USDT",  "name": "USDT (Byreal CLMM)",   "chain": "Mantle",   "category": "Stablecoin"},
    {"symbol": "USDC",  "name": "USDC (Byreal LP)",      "chain": "Mantle",   "category": "Stablecoin"},
    {"symbol": "mETH",  "name": "mETH (Mantle Stake)",   "chain": "Mantle",   "category": "LST"},
    {"symbol": "USDY",  "name": "USDY (Mantle RWA)",     "chain": "Mantle",   "category": "RWA"},
    {"symbol": "WMNT",  "name": "WMNT (Mantle Pool)",    "chain": "Mantle",   "category": "DeFi"},
]

_FALLBACK_YIELDS = {
    "USDT": 5.2, "USDC": 4.8, "mETH": 4.1, "USDY": 5.5, "WMNT": 8.3,
}


async def _fetch_defillama_mantle() -> dict:
    """Fetch yield data from DeFiLlama for Mantle chain pools."""
    global _CACHE, _CACHE_TS
    if time.time() - _CACHE_TS < _TTL and _CACHE:
        return _CACHE

    result: dict[str, float] = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://yields.llama.fi/pools")
            if r.status_code == 200:
                pools = r.json().get("data", [])
                mantle_pools = [p for p in pools if p.get("chain", "").lower() == "mantle"]
                for sym in _FALLBACK_YIELDS:
                    best = None
                    for p in mantle_pools:
                        if sym.lower() in p.get("symbol", "").lower():
                            apy = p.get("apy") or p.get("apyBase") or 0
                            if apy and apy > 0 and (best is None or apy > best):
                                best = round(apy, 2)
                    result[sym] = best if best else _FALLBACK_YIELDS[sym]
                _CACHE = result
                _CACHE_TS = time.time()
                print(f"[RWA] DeFiLlama yields: {result}")
                return result
    except Exception as e:
        print(f"[RWA] DeFiLlama error: {e}")

    return _FALLBACK_YIELDS


async def get_rwa_yields(btc_change: float = 0.0, eth_change: float = 0.0) -> dict:
    """Return RWA portfolio with live DeFiLlama yields."""
    yields = await _fetch_defillama_mantle()

    total_apy = round(sum(yields.values()) / len(yields), 2)
    regime = "RISK_ON" if btc_change > 2 else "RISK_OFF" if btc_change < -2 else "NEUTRAL"
    alloc = _get_allocation(regime)

    assets = []
    for t in _TARGETS:
        sym = t["symbol"]
        apy = yields.get(sym, _FALLBACK_YIELDS.get(sym, 4.0))
        alloc_pct = alloc.get(sym, 15)
        assets.append({
            "symbol":       sym,
            "name":         t["name"],
            "chain":        t["chain"],
            "category":     t["category"],
            "apy":          apy,
            "allocation_pct": alloc_pct,
            "status":       "ACTIVE",
            "risk":         "LOW" if t["category"] in ("Stablecoin", "RWA") else "MEDIUM",
        })

    return {
        "assets":        assets,
        "total_apy":     total_apy,
        "regime":        regime,
        "health_score":  min(100, int(total_apy * 12)),
        "last_rebalance": "Live",
        "data_source":   "DeFiLlama" if _CACHE else "Estimate",
    }


def _get_allocation(regime: str) -> dict:
    if regime == "RISK_OFF":
        return {"USDT": 35, "USDC": 30, "USDY": 20, "mETH": 10, "WMNT": 5}
    elif regime == "RISK_ON":
        return {"USDT": 15, "USDC": 15, "USDY": 15, "mETH": 25, "WMNT": 30}
    return {"USDT": 20, "USDC": 20, "USDY": 20, "mETH": 20, "WMNT": 20}
