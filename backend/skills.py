"""
Agent Skills loader — fetches and caches SKILL.md definitions from GitHub.
Compatible with the agentskills open format (https://github.com/agentskills/agentskills).
"""
import asyncio
import time
import httpx

_SKILLS = {
    "byreal-perps-cli": {
        "url": "https://raw.githubusercontent.com/byreal-git/byreal-perps-cli/main/skills/byreal-perps-cli/SKILL.md",
        "description": "Hyperliquid perpetual futures: orders, positions, signals, leverage, TP/SL",
        "keywords": ["perps", "futures", "hyperliquid", "order", "position", "leverage", "signal", "tpsl", "short", "long"],
    },
    "byreal-cli": {
        "url": "https://raw.githubusercontent.com/byreal-git/byreal-agent-skills/main/skills/byreal-cli/SKILL.md",
        "description": "Byreal DEX (Solana): pools, swaps, CLMM positions, token info, wallet balance",
        "keywords": ["dex", "swap", "pool", "liquidity", "clmm", "solana", "byreal", "lp", "defi"],
    },
    "soeclaw-ai-cfo": {
        "url": "https://raw.githubusercontent.com/kataenda/soeclaw/main/SKILL.md",
        "description": "SoeClaw AI CFO — autonomous trading on Mantle L2 with ERC-8004 on-chain verification",
        "keywords": ["soeclaw", "cfo", "mantle", "erc8004", "alpha", "scorecard"],
    },
}

# In-memory cache: name → {content, ts}
_cache: dict[str, dict] = {}
_TTL = 3600  # 1 hour


async def fetch_skill(name: str) -> str | None:
    """Return SKILL.md content for the given skill name, using cache."""
    if name not in _SKILLS:
        return None
    now = time.time()
    cached = _cache.get(name)
    if cached and now - cached["ts"] < _TTL:
        return cached["content"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(_SKILLS[name]["url"])
            if r.status_code == 200:
                content = r.text
                _cache[name] = {"content": content, "ts": now}
                return content
    except Exception:
        pass
    return cached["content"] if cached else None


def match_skill(text: str) -> str | None:
    """Return skill name if text matches any skill keywords."""
    lower = text.lower()
    for name, meta in _SKILLS.items():
        if any(kw in lower for kw in meta["keywords"]):
            return name
    return None


def list_skills() -> list[dict]:
    return [
        {"name": n, "description": m["description"], "cached": n in _cache}
        for n, m in _SKILLS.items()
    ]


async def warm_cache():
    """Pre-fetch all skills on startup."""
    await asyncio.gather(*[fetch_skill(n) for n in _SKILLS], return_exceptions=True)
