"""
Discord Alert Sender — webhook-based (no bot token needed).
Create a webhook in your Discord server: Server Settings → Integrations → Webhooks.
Set DISCORD_WEBHOOK_URL in .env.
"""
import os
import httpx

WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")


def _md_to_discord(text: str) -> str:
    """Minimal Telegram Markdown → Discord Markdown conversion."""
    # Telegram uses *bold* and _italic_, Discord uses **bold** and *italic*
    # Simple swap: replace single * with ** (not perfect but good enough)
    out = text
    out = out.replace("*", "**")   # bold
    out = out.replace("_", "*")    # italic
    return out


async def send_discord(markdown_text: str):
    """Called by alert_manager to push an alert to the Discord webhook."""
    if not WEBHOOK_URL:
        return

    content = _md_to_discord(markdown_text)
    # Discord has a 2000 char limit
    if len(content) > 2000:
        content = content[:1990] + "…"

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                WEBHOOK_URL,
                json={"content": content, "username": "SoeClaw Alpha"},
            )
            if resp.status_code not in (200, 204):
                print(f"[Discord] Webhook returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"[Discord] Send error: {e}")
