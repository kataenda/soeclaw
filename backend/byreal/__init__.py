"""
Byreal SDK integration — wraps @byreal-io/byreal-cli and @byreal-io/byreal-perps-cli
via subprocess calls. Returns structured JSON for AI agent consumption.
"""
import asyncio
import json
import shlex
import subprocess
import shutil
from typing import Any

# Resolve full npx path at startup so it works on Windows (cmd.exe PATH)
_NPX = shutil.which("npx") or "npx"
_BYREAL_CMD  = f'"{_NPX}" @byreal-io/byreal-cli'
_PERPS_CMD   = f'"{_NPX}" @byreal-io/byreal-perps-cli'


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
