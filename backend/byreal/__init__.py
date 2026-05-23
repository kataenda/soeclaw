"""
Byreal SDK integration — wraps @byreal-io/byreal-cli and @byreal-io/byreal-perps-cli
via subprocess calls. Returns structured JSON for AI agent consumption.
"""
import asyncio
import json
import shlex
from typing import Any

_BYREAL_CMD  = "npx @byreal-io/byreal-cli"
_PERPS_CMD   = "npx @byreal-io/byreal-perps-cli"


async def _run(cmd: str) -> dict[str, Any]:
    """Run a CLI command and return parsed JSON output."""
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    raw = stdout.decode().strip()
    if not raw:
        raise RuntimeError(stderr.decode().strip() or "No output from CLI")
    return json.loads(raw)


# ── Byreal DEX (CLMM / Spot) ─────────────────────────────────────────────────

async def get_dex_overview() -> dict:
    return await _run(f"{_BYREAL_CMD} overview -o json --non-interactive")


async def get_pools(limit: int = 20) -> dict:
    return await _run(f"{_BYREAL_CMD} pools list -o json --non-interactive")


async def search_pools(query: str) -> dict:
    return await _run(f"{_BYREAL_CMD} pools search {shlex.quote(query)} -o json --non-interactive")


async def get_tokens() -> dict:
    return await _run(f"{_BYREAL_CMD} tokens list -o json --non-interactive")


async def get_swap_preview(from_token: str, to_token: str, amount: float) -> dict:
    return await _run(
        f"{_BYREAL_CMD} swap preview {from_token} {to_token} {amount} -o json --non-interactive"
    )


async def get_positions() -> dict:
    return await _run(f"{_BYREAL_CMD} positions list -o json --non-interactive")


# ── Byreal Perps ─────────────────────────────────────────────────────────────

async def get_perps_signals() -> dict:
    return await _run(f"{_PERPS_CMD} signal scan -o json")


async def get_perps_positions() -> dict:
    return await _run(f"{_PERPS_CMD} position list -o json")


async def get_perps_account() -> dict:
    return await _run(f"{_PERPS_CMD} account info -o json")
