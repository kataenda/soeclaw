"""
Whale Tracker — monitors Mantle Sepolia for large native MNT transfers.
Polls new blocks every 30s and fires an alert for any tx above the threshold.
Also tracks a watchlist of known high-value addresses.
"""
import asyncio
import os
from web3 import Web3
from .alert_manager import dispatch_alert, Alert

RPC_URL          = "https://rpc.sepolia.mantle.xyz"
WHALE_THRESHOLD  = float(os.getenv("WHALE_THRESHOLD_MNT", "500"))   # MNT
POLL_INTERVAL    = 30   # seconds between block polls
MAX_BLOCKS_BATCH = 5    # max blocks to scan per iteration

# Optional: known smart money addresses to always watch (add more via env)
_raw_watchlist = os.getenv("WHALE_WATCHLIST", "")
WATCHLIST: set[str] = {
    addr.strip().lower()
    for addr in _raw_watchlist.split(",")
    if addr.strip().startswith("0x")
}


def _short(addr: str) -> str:
    return f"{addr[:8]}...{addr[-6:]}"


async def whale_tracking_loop():
    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 10}))

    if not w3.is_connected():
        print("[Whale] Cannot connect to Mantle RPC — whale tracking disabled")
        return

    last_block = w3.eth.block_number
    print(f"[Whale] Tracker started at block {last_block} (threshold: {WHALE_THRESHOLD} MNT)")

    if WATCHLIST:
        print(f"[Whale] Watchlist: {len(WATCHLIST)} addresses")

    while True:
        await asyncio.sleep(POLL_INTERVAL)

        try:
            current_block = w3.eth.block_number

            if current_block <= last_block:
                continue

            scan_to = min(current_block, last_block + MAX_BLOCKS_BATCH)

            for block_num in range(last_block + 1, scan_to + 1):
                try:
                    block = w3.eth.get_block(block_num, full_transactions=True)
                except Exception as e:
                    print(f"[Whale] Block {block_num} fetch error: {e}")
                    continue

                for tx in block.transactions:
                    value_mnt   = float(w3.from_wei(tx.value, "ether"))
                    from_addr   = tx["from"].lower()
                    to_addr_raw = tx.get("to")
                    to_addr     = to_addr_raw.lower() if to_addr_raw else None

                    is_whale    = value_mnt >= WHALE_THRESHOLD
                    is_watched  = from_addr in WATCHLIST or (to_addr and to_addr in WATCHLIST)

                    if not (is_whale or is_watched):
                        continue

                    label = "🐋 Whale Alert" if is_whale else "👁️ Watchlist Move"
                    severity: str = "HIGH" if is_whale else "MEDIUM"
                    to_display = _short(to_addr_raw) if to_addr_raw else "Contract Creation"

                    explorer = f"https://explorer.sepolia.mantle.xyz/tx/{tx.hash.hex()}"

                    await dispatch_alert(Alert(
                        type="WHALE",
                        title=f"{label} — {value_mnt:,.1f} MNT",
                        message=(
                            f"Amount: *{value_mnt:,.2f} MNT*\n"
                            f"From: `{_short(tx['from'])}`\n"
                            f"To:   `{to_display}`\n"
                            f"Block: {block_num}\n"
                            f"[Explorer]({explorer})"
                        ),
                        severity=severity,
                        symbol=f"WHALE:{tx.hash.hex()[:12]}",
                    ))

                    if is_watched:
                        watched_addr = from_addr if from_addr in WATCHLIST else to_addr
                        print(f"[Whale] Watchlist address active: {watched_addr}")

            last_block = scan_to

        except Exception as e:
            print(f"[Whale] Loop error: {e}")
