"""
AI DevTools — Mantle-specific Solidity audit assistant powered by Claude.
Analyses smart contract code for vulnerabilities, gas inefficiencies,
and Mantle L2-specific issues.
"""
import os
import json

ANTHROPIC_API_KEY = os.getenv("AGENT_API_KEY", "")

AUDIT_SYSTEM_PROMPT = """You are a senior smart contract auditor specialising in Mantle L2.
You audit Solidity contracts for:
1. Critical vulnerabilities (reentrancy, overflow, access control)
2. High/medium/low severity issues
3. Gas optimisation opportunities specific to Mantle L2
4. Mantle-specific issues (MNT gas token, L2 bridge patterns, sequencer assumptions)
5. ERC standard compliance

Respond ONLY with valid JSON in this exact format:
{
  "risk_score": <0-100, 0=safe 100=critical>,
  "summary": "<2 sentence overview>",
  "issues": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
      "title": "<issue title>",
      "description": "<what the issue is>",
      "recommendation": "<how to fix it>",
      "line_ref": "<line or function if identifiable>"
    }
  ],
  "gas_optimisations": [
    {"title": "<optimisation>", "estimated_savings": "<gas or %>"}
  ],
  "mantle_specific": ["<any Mantle L2 specific notes>"],
  "overall_verdict": "SAFE|NEEDS_REVIEW|UNSAFE"
}"""


def _rule_based_audit(code: str) -> dict:
    """Fast rule-based checks when Claude is unavailable."""
    issues = []
    code_lower = code.lower()

    checks = [
        ("CRITICAL", "Reentrancy risk",
         "External call before state update",
         "Use checks-effects-interactions pattern or ReentrancyGuard",
         lambda c: ".call{" in c and ("balances[" in c or "balance -=" in c)),

        ("HIGH", "Missing access control",
         "Public/external function with state changes lacks onlyOwner or role check",
         "Add OpenZeppelin AccessControl or Ownable modifier",
         lambda c: "public" in c and ("delete " in c or "selfdestruct" in c)),

        ("HIGH", "Unchecked return value",
         "Low-level .call() return value not checked",
         "Always check (bool success,) = addr.call{...}(...); require(success);",
         lambda c: ".call(" in c and "bool success" not in c and "require(" not in c.split(".call(")[1][:100] if ".call(" in c else False),

        ("MEDIUM", "Floating pragma",
         "Uses ^pragma instead of fixed version",
         "Pin to exact compiler version: pragma solidity 0.8.20;",
         lambda c: "pragma solidity ^" in c),

        ("MEDIUM", "Block timestamp dependence",
         "Logic depends on block.timestamp which miners/sequencers can manipulate slightly",
         "Add tolerance buffer; don't use for randomness or critical timing",
         lambda c: "block.timestamp" in c),

        ("LOW", "Missing events",
         "State-changing functions don't emit events",
         "Emit events for all important state changes for off-chain indexing",
         lambda c: "function " in c and "emit " not in c),

        ("INFO", "No NatSpec",
         "Missing NatSpec documentation on public functions",
         "Add /// @notice and @param docs for all public functions",
         lambda c: "/// @" not in c and "/** @" not in c),
    ]

    for severity, title, desc, rec, check_fn in checks:
        try:
            if check_fn(code_lower):
                issues.append({
                    "severity": severity,
                    "title": title,
                    "description": desc,
                    "recommendation": rec,
                    "line_ref": "see code",
                })
        except Exception:
            pass

    risk = sum({"CRITICAL": 40, "HIGH": 25, "MEDIUM": 15, "LOW": 5, "INFO": 1}.get(i["severity"], 0) for i in issues)
    verdict = "UNSAFE" if risk >= 40 else "NEEDS_REVIEW" if risk >= 15 else "SAFE"

    return {
        "risk_score": min(100, risk),
        "summary": f"Rule-based scan found {len(issues)} issue(s). Install AGENT_API_KEY for deep AI audit.",
        "issues": issues,
        "gas_optimisations": [
            {"title": "Use uint128 for percentages instead of uint256", "estimated_savings": "~2000 gas/store"},
            {"title": "Pack struct fields by size (bool,uint8,uint16…)", "estimated_savings": "1 storage slot = ~20000 gas"},
        ],
        "mantle_specific": [
            "Mantle uses MNT as gas token — gas cost estimates differ from ETH mainnet",
            "L2 sequencer can batch transactions — avoid timestamp-critical logic",
        ],
        "overall_verdict": verdict,
    }


async def audit_contract(solidity_code: str) -> dict:
    """
    Audit a Solidity contract. Uses Claude if API key set, else rule-based.
    """
    if len(solidity_code.strip()) < 20:
        return {"error": "Contract code too short to audit"}

    if ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != "your_anthropic_api_key_here":
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1500,
                system=AUDIT_SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Audit this Solidity contract:\n\n```solidity\n{solidity_code[:4000]}\n```"
                }],
            )
            text = msg.content[0].text.strip()
            if "```" in text:
                text = text.split("```")[1].replace("json", "").strip()
            return json.loads(text)
        except Exception as e:
            print(f"[DevTools] Claude audit error: {e} — falling back to rule-based")

    return _rule_based_audit(solidity_code)
