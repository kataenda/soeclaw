"""
Byreal SDK integration — wraps @byreal-io/byreal-cli and @byreal-io/byreal-perps-cli
via subprocess calls. Returns structured JSON for AI agent consumption.

RealClaw swap: set REALCLAW_MODE=true in .env when invitation code is received.
All public functions remain the same — only the underlying CLI changes.
"""
import asyncio
import json
import os
import shlex
import subprocess
import shutil
from typing import Any

# Resolve full npx path at startup so it works on Windows (cmd.exe PATH)
_NPX = shutil.which("npx") or "npx"
_BYREAL_CMD  = f'"{_NPX}" @byreal-io/byreal-cli'
_PERPS_CMD   = f'"{_NPX}" @byreal-io/byreal-perps-cli'

# RealClaw mode — swap CLI when invitation code received
# Set REALCLAW_MODE=true in .env and install @byreal-io/realclaw
_REALCLAW_MODE = os.getenv("REALCLAW_MODE", "false").lower() == "true"
_REALCLAW_CMD  = f'"{_NPX}" @byreal-io/realclaw'


def _run_sync(cmd: str) -> dict[str, Any]:
    """Run a Byreal CLI command synchronously. Called via asyncio.to_thread."""
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    raw = result.stdout.strip()
    if not raw:
        raise RuntimeError(result.stderr.strip() or f"CLI exited {result.returncode} with no output")
    return json.loads(raw)


async def _run(cmd: str) -> dict[str, Any]:
    """Run a CLI command in a thread pool and return parsed JSON."""
    return await asyncio.to_thread(_run_sync, cmd)


def _dex_cmd() -> str:
    """Returns the active DEX CLI command (Byreal or RealClaw)."""
    return _REALCLAW_CMD if _REALCLAW_MODE else _BYREAL_CMD


# ── Byreal DEX (CLMM / Spot) ─────────────────────────────────────────────────

async def get_dex_overview() -> dict:
    return await _run(f"{_dex_cmd()} overview -o json --non-interactive")


async def get_pools(limit: int = 20) -> dict:
    return await _run(f"{_dex_cmd()} pools list -o json --non-interactive")


async def search_pools(query: str) -> dict:
    return await _run(f"{_dex_cmd()} pools search {shlex.quote(query)} -o json --non-interactive")


async def get_tokens() -> dict:
    return await _run(f"{_dex_cmd()} tokens list -o json --non-interactive")


async def get_swap_preview(from_token: str, to_token: str, amount: float) -> dict:
    return await _run(
        f"{_dex_cmd()} swap preview {from_token} {to_token} {amount} -o json --non-interactive"
    )


async def execute_swap(from_token: str, to_token: str, amount: float, slippage: float = 0.5) -> dict:
    return await _run(
        f"{_dex_cmd()} swap execute {from_token} {to_token} {amount} --slippage {slippage} -o json --non-interactive"
    )


async def get_positions() -> dict:
    return await _run(f"{_dex_cmd()} positions list -o json --non-interactive")


async def get_wallet_balance() -> dict:
    return await _run(f"{_dex_cmd()} wallet balance -o json --non-interactive")


async def analyze_pool(pool_id: str) -> dict:
    return await _run(f"{_dex_cmd()} pools analyze {shlex.quote(pool_id)} -o json --non-interactive")


# ── Byreal Perps ─────────────────────────────────────────────────────────────

async def get_perps_signals() -> dict:
    return await _run(f"{_PERPS_CMD} signal scan -o json")


async def get_signal_detail(symbol: str) -> dict:
    return await _run(f"{_PERPS_CMD} signal detail {shlex.quote(symbol)} -o json")


async def get_perps_positions() -> dict:
    return await _run(f"{_PERPS_CMD} position list -o json")


async def get_perps_account() -> dict:
    return await _run(f"{_PERPS_CMD} account info -o json")


async def get_perps_history() -> dict:
    return await _run(f"{_PERPS_CMD} account history -o json")


async def execute_market_order(symbol: str, side: str, size: float,
                               leverage: int = 5, tp: float | None = None,
                               sl: float | None = None) -> dict:
    extra = ""
    if tp:
        extra += f" --tp {tp}"
    if sl:
        extra += f" --sl {sl}"
    return await _run(
        f"{_PERPS_CMD} order market {shlex.quote(symbol)} {side.lower()} {size}"
        f" --leverage {leverage}{extra} -o json"
    )
