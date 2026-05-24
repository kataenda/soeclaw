#!/usr/bin/env python3
"""
Byreal Skills CLI v1.0.0
Agentic wallet economy management for SoeClaw AI on Mantle L2.

Usage:
  python byreal_cli.py agents                            List all AI agents
  python byreal_cli.py skills [AGENT]                   Show agent skills
  python byreal_cli.py economy                           Show MNT balances
  python byreal_cli.py transfer <FROM> <TO> <AMOUNT>    Transfer MNT
  python byreal_cli.py register <AGENT> --skill <NAME>  Register skill
  python byreal_cli.py mint <AGENT> <SKILL>             Mint skill on-chain
  python byreal_cli.py export [--output file.json]      Export registry
  python byreal_cli.py status                           Check API
"""
import argparse
import json
import os
import sys
import time
import uuid
import urllib.request
import urllib.error

# ── Colour helpers ────────────────────────────────────────────────────────────
_USE_COLOR = sys.stdout.isatty() and os.name != "nt" or (
    os.name == "nt" and os.environ.get("TERM_PROGRAM") or os.environ.get("WT_SESSION")
)
try:
    import ctypes
    if os.name == "nt":
        ctypes.windll.kernel32.SetConsoleMode(ctypes.windll.kernel32.GetStdHandle(-11), 7)
        _USE_COLOR = True
except Exception:
    pass

CYAN    = "\033[96m" if _USE_COLOR else ""
GREEN   = "\033[92m" if _USE_COLOR else ""
YELLOW  = "\033[93m" if _USE_COLOR else ""
RED     = "\033[91m" if _USE_COLOR else ""
MAGENTA = "\033[95m" if _USE_COLOR else ""
BLUE    = "\033[94m" if _USE_COLOR else ""
BOLD    = "\033[1m"  if _USE_COLOR else ""
DIM     = "\033[2m"  if _USE_COLOR else ""
RESET   = "\033[0m"  if _USE_COLOR else ""

def clr(text, *codes):
    return "".join(codes) + str(text) + RESET

def strip_ansi(s):
    """Remove ANSI codes for length calculation."""
    import re
    return re.sub(r"\033\[[0-9;]*m", "", s)

# ── Config ────────────────────────────────────────────────────────────────────
_API_BASE = os.getenv("SOECLAW_API", "http://localhost:8000")

# ── HTTP helpers ──────────────────────────────────────────────────────────────
def api_get(path: str) -> dict:
    try:
        with urllib.request.urlopen(f"{_API_BASE}{path}", timeout=8) as r:
            return json.loads(r.read().decode())
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", str(e))
        print(clr(f"\n  ✗ Cannot reach backend at {_API_BASE}", RED, BOLD))
        print(clr(f"    {reason}", DIM))
        print(clr(f"\n  → Start the backend first: uvicorn main:app --reload", YELLOW))
        sys.exit(1)
    except Exception as e:
        print(clr(f"  ✗ Error: {e}", RED))
        sys.exit(1)


def api_post(path: str, data: dict) -> dict:
    body = json.dumps(data).encode()
    req  = urllib.request.Request(
        f"{_API_BASE}{path}", data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            pass
        print(clr(f"  ✗ HTTP {e.code}: {e.reason}", RED))
        sys.exit(1)
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", str(e))
        print(clr(f"  ✗ Cannot reach backend: {reason}", RED, BOLD))
        sys.exit(1)


# ── Visual components ─────────────────────────────────────────────────────────
def banner():
    print()
    line1 = "  ⚡ BYREAL SKILLS CLI  " + clr("v1.0.0", DIM)
    line2 = "  SoeClaw AI · Mantle Sepolia · ERC-8004 Protocol"
    w = max(len(strip_ansi(line1)), len(line2)) + 4
    print(clr("╔" + "═" * w + "╗", CYAN))
    print(clr("║", CYAN) + clr(line1, BOLD, CYAN) + " " * (w - len(strip_ansi(line1))) + clr("║", CYAN))
    print(clr("║", CYAN) + clr(line2, DIM)        + " " * (w - len(line2))             + clr("║", CYAN))
    print(clr("╚" + "═" * w + "╝", CYAN))
    print()


def section(title: str):
    print(clr(f"  {title}", BOLD))
    print(clr("  " + "─" * (len(title) + 2), DIM))


def ok(msg: str):
    print(clr(f"\n  ✓ {msg}", GREEN, BOLD))


def err(msg: str):
    print(clr(f"\n  ✗ {msg}", RED, BOLD))


def kv(key: str, val: str, key_w: int = 10):
    print(f"  {clr(key.ljust(key_w), DIM)}  {val}")


def simple_table(headers: list, rows: list, col_widths: list = None):
    if not rows:
        print(clr("  (empty)", DIM))
        return

    # Calculate column widths
    if not col_widths:
        col_widths = []
        for i, h in enumerate(headers):
            max_w = len(h)
            for row in rows:
                cell = strip_ansi(str(row[i])) if i < len(row) else ""
                max_w = max(max_w, len(cell))
            col_widths.append(max_w + 2)

    def row_str(cells, bold_first=False):
        parts = []
        for i, (cell, w) in enumerate(zip(cells, col_widths)):
            cell_str = str(cell)
            pad = w - len(strip_ansi(cell_str))
            if i == 0 and bold_first:
                parts.append(clr(cell_str, BOLD) + " " * max(0, pad))
            else:
                parts.append(cell_str + " " * max(0, pad))
        return "  │ " + " │ ".join(parts) + " │"

    sep = "  ├─" + "─┼─".join("─" * w for w in col_widths) + "─┤"
    top = "  ┌─" + "─┬─".join("─" * w for w in col_widths) + "─┐"
    bot = "  └─" + "─┴─".join("─" * w for w in col_widths) + "─┘"

    print(clr(top, DIM))
    print(clr(row_str([clr(h, CYAN) for h in headers]), DIM))
    print(clr(sep, DIM))
    for row in rows:
        print(row_str(row, bold_first=True))
    print(clr(bot, DIM))


def progress_bar(value: float, max_val: float, width: int = 18) -> str:
    pct   = min(1.0, value / max_val) if max_val > 0 else 0
    filled = int(pct * width)
    bar   = clr("█" * filled, GREEN) + clr("░" * (width - filled), DIM)
    return f"[{bar}] {pct*100:.0f}%"


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_status(_args):
    banner()
    section("API CONNECTION")
    print()
    print(clr(f"  Endpoint: {_API_BASE}", DIM))

    data = api_get("/api/health")

    ok("Backend online")
    kv("Status",  clr(data.get("status", "ok").upper(), GREEN), 8)
    kv("Network", data.get("network", "Mantle Sepolia Testnet"), 8)
    kv("Agents",  str(len(data.get("agents", []))), 8)
    print()


def cmd_agents(_args):
    banner()
    data   = api_get("/api/agents/skills")
    agents = data.get("agents", [])
    proto  = data.get("protocol", "byreal-skills-v1")

    section(f"AI AGENTS  [{len(agents)} registered · {proto}]")
    print()

    for ag in agents:
        erc = ag.get("erc8004_token_id")
        erc_str = clr(f"  ERC-8004 #{erc}", YELLOW) if erc is not None else ""
        print(f"  {clr('◈', CYAN)}  {clr(ag['name'], CYAN, BOLD)}{erc_str}  {clr('[' + ag['id'] + ']', DIM)}")

        skills = ag.get("skills", [])
        TYPE_CLR = {"strategy": GREEN, "data": CYAN, "risk": YELLOW, "signal": MAGENTA}
        for i, sk in enumerate(skills):
            prefix = "  └──" if i == len(skills) - 1 else "  ├──"
            t     = sk.get("type", "?")
            tc    = TYPE_CLR.get(t, "")
            print(f"  {clr(prefix, DIM)} {clr(sk['name'], BOLD)}  {clr('v' + sk.get('version', '?'), DIM)}  {clr('[' + t + ']', tc)}  {clr(sk.get('description', ''), DIM)}")
        print()


def cmd_skills(args):
    banner()
    data   = api_get("/api/agents/skills")
    agents = data.get("agents", [])
    target = getattr(args, "agent", None)

    if target:
        agents = [a for a in agents if a["name"].lower() == target.lower()]
        if not agents:
            err(f"Agent '{target}' not found.")
            print(clr(f"  Available: {', '.join(a['name'] for a in data.get('agents', []))}", DIM))
            sys.exit(1)

    section(f"SKILL REGISTRY  [v{data.get('version', '?')} · {data.get('protocol', '?')}]")
    print()

    TYPE_CLR = {"STRATEGY": GREEN, "DATA": CYAN, "RISK": YELLOW, "SIGNAL": MAGENTA}
    rows = []
    for ag in agents:
        for sk in ag.get("skills", []):
            t  = sk.get("type", "?").upper()
            tc = TYPE_CLR.get(t, "")
            rows.append([
                clr(ag["name"], CYAN),
                clr(sk["name"], BOLD),
                sk.get("version", "?"),
                clr(t, tc),
                sk.get("description", ""),
            ])

    simple_table(["Agent", "Skill", "Ver", "Type", "Description"],
                 rows, [16, 24, 5, 12, 42])
    print()


def cmd_economy(_args):
    banner()
    data   = api_get("/api/agents/economy")
    agents = data.get("agents", [])
    total  = data.get("total_mnt_in_system", 0)

    section("VIRTUAL AGENT ECONOMY  [MNT · Mantle Sepolia]")
    print()
    print(f"  {clr('Total MNT in system:', DIM)}  {clr(f'{total:,.0f} MNT', GREEN, BOLD)}")
    print()

    for ag in sorted(agents, key=lambda x: x.get("virtual_balance_mnt", 0), reverse=True):
        bal = ag.get("virtual_balance_mnt", 0)
        wr  = ag.get("win_rate_pct", 0.0)
        tr  = ag.get("trade_count", 0)
        pct = ((bal - 10_000) / 10_000) * 100
        pct_str = clr(f"+{pct:.1f}%", GREEN) if pct >= 0 else clr(f"{pct:.1f}%", RED)

        print(f"  {clr(ag['name'], CYAN, BOLD)}")
        print(f"    {clr('Balance :', DIM)} {clr(f'{bal:>10,.1f} MNT', BOLD)}  {progress_bar(bal, 10_000 * 1.5)}  {pct_str}")
        print(f"    {clr('Trades  :', DIM)} {tr}   {clr('Win Rate:', DIM)} {clr(f'{wr:.1f}%', GREEN if wr >= 50 else RED)}")
        skills = ag.get("skills", [])
        if skills:
            print(f"    {clr('Skills  :', DIM)} {clr(', '.join(skills), DIM)}")
        print()

    endpoint = data.get("byreal_skills_endpoint", f"{_API_BASE}/api/agents/skills")
    print(clr(f"  Skills endpoint: {endpoint}", DIM))
    print()


def cmd_transfer(args):
    banner()
    from_agent = args.from_agent
    to_agent   = args.to_agent
    try:
        amount = float(args.amount)
    except ValueError:
        err("Amount must be a number.")
        sys.exit(1)

    section("MNT TRANSFER")
    print()
    kv("From",   clr(from_agent, CYAN, BOLD))
    kv("To",     clr(to_agent, CYAN, BOLD))
    kv("Amount", clr(f"{amount:,.1f} MNT", GREEN, BOLD))
    print()

    result = api_post("/api/agents/economy/transfer", {
        "from_agent": from_agent,
        "to_agent":   to_agent,
        "amount":     amount,
    })

    if result.get("success"):
        ok("Transfer complete!")
        kv("Tx ID",            clr(result.get("tx_id", "N/A"), DIM))
        kv(f"{from_agent} bal", clr(f"{result.get('from_balance', '?'):,.1f} MNT", GREEN))
        kv(f"{to_agent} bal",   clr(f"{result.get('to_balance', '?'):,.1f} MNT", GREEN))
    else:
        err(f"Transfer failed: {result.get('error', 'unknown error')}")
    print()


def cmd_register(args):
    banner()
    section("REGISTER SKILL")
    print()
    kv("Agent",   clr(args.agent, CYAN, BOLD))
    kv("Skill",   clr(args.skill, GREEN, BOLD))
    kv("Type",    args.type or "strategy")
    kv("Version", args.version or "1.0")
    kv("Desc",    clr(args.description or f"{args.skill} capability", DIM))
    print()

    result = api_post("/api/agents/skills/register", {
        "agent":       args.agent,
        "skill":       args.skill,
        "type":        args.type or "strategy",
        "version":     args.version or "1.0",
        "description": args.description or f"{args.skill} capability",
    })

    if result.get("success"):
        ok("Skill registered in Byreal registry!")
        kv("Skill ID",    clr(result.get("skill_id", "N/A"), DIM))
        kv("Total skills", str(result.get("total_skills", "?")))
    else:
        err(f"Registration failed: {result.get('error', 'unknown error')}")
    print()


def cmd_mint(args):
    banner()
    section("MINT SKILL ON-CHAIN")
    print()
    kv("Agent", clr(args.agent, CYAN, BOLD))
    kv("Skill", clr(args.skill, GREEN, BOLD))

    print()
    print(clr("  Submitting to Mantle Sepolia...", DIM), end="", flush=True)
    time.sleep(0.6)  # simulate tx submission

    result = api_post("/api/agents/skills/mint", {
        "agent": args.agent,
        "skill": args.skill,
    })

    print(clr(" done", GREEN))

    tx = result.get("tx_hash", "")
    if result.get("success") or tx:
        ok("Skill minted!")
        kv("Tx Hash", clr(tx, DIM))
        if tx and not tx.endswith(("_offline", "_error")):
            kv("Explorer", f"https://sepolia.mantlescan.xyz/tx/{tx}")
        else:
            kv("Note", clr("Wallet offline — skill recorded locally", YELLOW))
    else:
        err(f"Mint failed: {result.get('error', 'unknown error')}")
    print()


def cmd_export(args):
    data    = api_get("/api/agents/skills")
    output  = getattr(args, "output", None) or "byreal_skills_export.json"
    ts      = data.copy()
    ts["exported_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with open(output, "w") as f:
        json.dump(ts, f, indent=2)

    n_agents = len(data.get("agents", []))
    n_skills = sum(len(a.get("skills", [])) for a in data.get("agents", []))
    ok(f"Exported to {clr(output, BOLD)}")
    print(clr(f"  {n_agents} agents · {n_skills} skills · Byreal Skills v{data.get('version', '?')}", DIM))
    print()


# ── Argument parser ───────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="byreal",
        description="Byreal Skills CLI — Agentic wallet economy for SoeClaw AI on Mantle L2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  python byreal_cli.py agents
  python byreal_cli.py skills AlphaQuant
  python byreal_cli.py economy
  python byreal_cli.py transfer AlphaQuant WhaleWatcher 500
  python byreal_cli.py register AlphaQuant --skill arbitrage --type strategy
  python byreal_cli.py mint RiskManager drawdown_control
  python byreal_cli.py export --output registry.json
  python byreal_cli.py status
        """,
    )
    p.add_argument("--api", metavar="URL", help=f"API base URL (env: SOECLAW_API, default: {_API_BASE})")

    sub = p.add_subparsers(dest="cmd", metavar="<command>")

    sub.add_parser("agents",  help="List all AI agents and their ERC-8004 token IDs")

    p_sk = sub.add_parser("skills", help="Show registered skills (optionally filter by agent)")
    p_sk.add_argument("agent", nargs="?", metavar="AGENT", help="Agent name to filter")

    sub.add_parser("economy", help="Show virtual MNT balances and P&L")

    p_tr = sub.add_parser("transfer", help="Transfer virtual MNT between agents")
    p_tr.add_argument("from_agent", metavar="FROM",   help="Source agent name")
    p_tr.add_argument("to_agent",   metavar="TO",     help="Destination agent name")
    p_tr.add_argument("amount",     metavar="AMOUNT", help="MNT amount to transfer")

    p_rg = sub.add_parser("register", help="Register a new skill in the Byreal registry")
    p_rg.add_argument("agent",            help="Agent name")
    p_rg.add_argument("--skill",          required=True, help="Skill name (e.g. arbitrage)")
    p_rg.add_argument("--type",           default="strategy",
                      choices=["strategy", "data", "risk", "signal"], help="Skill type")
    p_rg.add_argument("--version",        default="1.0", help="Skill version (default: 1.0)")
    p_rg.add_argument("--description",    help="Human-readable description")

    p_mn = sub.add_parser("mint", help="Mint a skill as on-chain record on Mantle Sepolia")
    p_mn.add_argument("agent", help="Agent name")
    p_mn.add_argument("skill", help="Skill name to mint")

    p_ex = sub.add_parser("export", help="Export Byreal Skills registry as JSON file")
    p_ex.add_argument("--output", "-o", metavar="FILE", help="Output path (default: byreal_skills_export.json)")

    sub.add_parser("status", help="Check API connection")

    return p


def main():
    global _API_BASE
    parser = build_parser()
    args   = parser.parse_args()

    if getattr(args, "api", None):
        _API_BASE = args.api.rstrip("/")

    dispatch = {
        "agents":   cmd_agents,
        "skills":   cmd_skills,
        "economy":  cmd_economy,
        "transfer": cmd_transfer,
        "register": cmd_register,
        "mint":     cmd_mint,
        "export":   cmd_export,
        "status":   cmd_status,
    }

    if not args.cmd:
        banner()
        parser.print_help()
        print()
        return

    dispatch[args.cmd](args)


if __name__ == "__main__":
    main()
