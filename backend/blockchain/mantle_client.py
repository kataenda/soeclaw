import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

RPC_URL = "https://rpc.sepolia.mantle.xyz"
CONTRACT_ADDRESS = os.getenv("MANTLE_CONTRACT_ADDRESS", "0x5FbDB2315678afecb367f032d93F642f64180aa3")
IDENTITY_REGISTRY_ADDRESS = os.getenv(
    "IDENTITY_REGISTRY_ADDRESS",
    "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d"
)
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")

# Agent name → ERC-8004 token ID on AgentIdentityRegistry
AGENT_TOKEN_IDS = {
    "AlphaQuant":    0,
    "WhaleWatcher":  1,
    "MacroAnalyzer": 3,
    "RiskManager":   4,
}

SOECLAW_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "_agentName", "type": "string"},
            {"internalType": "string", "name": "_symbol", "type": "string"},
            {"internalType": "string", "name": "_action", "type": "string"},
            {"internalType": "uint256", "name": "_confidence", "type": "uint256"}
        ],
        "name": "addTrade",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "string", "name": "_agentName", "type": "string"}
        ],
        "name": "triggerAgent",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

IDENTITY_REGISTRY_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "string",  "name": "agentName", "type": "string"},
            {"internalType": "string",  "name": "symbol", "type": "string"},
            {"internalType": "string",  "name": "action", "type": "string"},
            {"internalType": "uint256", "name": "confidence", "type": "uint256"}
        ],
        "name": "recordTrade",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "int256",  "name": "delta", "type": "int256"}
        ],
        "name": "updateReputation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"}
        ],
        "name": "getAgentReputation",
        "outputs": [{"internalType": "int256", "name": "", "type": "int256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"}
        ],
        "name": "getAgentTrades",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]


class MantleClient:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
        self.connected = self.w3.is_connected()
        self.contract = None
        self.identity_registry = None

        if self.connected:
            try:
                if CONTRACT_ADDRESS:
                    self.contract = self.w3.eth.contract(
                        address=Web3.to_checksum_address(CONTRACT_ADDRESS),
                        abi=SOECLAW_ABI
                    )
            except Exception as e:
                print(f"[MantleClient] SoeClaw init error: {e}")

            try:
                if IDENTITY_REGISTRY_ADDRESS:
                    self.identity_registry = self.w3.eth.contract(
                        address=Web3.to_checksum_address(IDENTITY_REGISTRY_ADDRESS),
                        abi=IDENTITY_REGISTRY_ABI
                    )
                    print(f"[MantleClient] ERC-8004 IdentityRegistry loaded at {IDENTITY_REGISTRY_ADDRESS}")
            except Exception as e:
                print(f"[MantleClient] IdentityRegistry init error: {e}")

    def _send_tx(self, fn, account, nonce: int) -> str:
        gas_estimate = fn.estimate_gas({"from": account.address})
        tx = fn.build_transaction({
            "chainId": 5003,
            "gas": int(gas_estimate * 1.2),
            "maxFeePerGas": self.w3.eth.gas_price,
            "maxPriorityFeePerGas": self.w3.to_wei("1", "gwei"),
            "nonce": nonce,
            "from": account.address,
        })
        signed = self.w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        tx_hash = self.w3.eth.send_raw_transaction(raw)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return receipt.transactionHash.hex()

    def log_trade_on_chain(self, agent_name: str, symbol: str, action: str, confidence: float) -> str:
        """
        Records trade on SoeClaw contract AND updates ERC-8004 AgentIdentityRegistry.
        Returns the ERC-8004 tx hash (the canonical on-chain identity record).
        """
        if not self.connected or not PRIVATE_KEY:
            return f"0x{'0' * 64}_offline"

        try:
            account = self.w3.eth.account.from_key(PRIVATE_KEY)
            conf_int = int(confidence * 100)
            nonce = self.w3.eth.get_transaction_count(account.address)

            # ── 1. SoeClaw.addTrade() ────────────────────────────────────────
            soeclaw_hash = None
            if self.contract:
                try:
                    soeclaw_hash = self._send_tx(
                        self.contract.functions.addTrade(agent_name, symbol, action, conf_int),
                        account, nonce
                    )
                    nonce += 1
                    print(f"[MantleClient] SoeClaw trade logged: {soeclaw_hash}")
                except Exception as e:
                    print(f"[MantleClient] SoeClaw.addTrade failed: {e}")
                    nonce = self.w3.eth.get_transaction_count(account.address)

            # ── 2. AgentIdentityRegistry.recordTrade() (ERC-8004) ───────────
            erc8004_hash = None
            token_id = AGENT_TOKEN_IDS.get(agent_name)
            if self.identity_registry and token_id is not None:
                try:
                    erc8004_hash = self._send_tx(
                        self.identity_registry.functions.recordTrade(
                            token_id, agent_name, symbol, action, conf_int
                        ),
                        account, nonce
                    )
                    nonce += 1
                    print(f"[MantleClient] ERC-8004 identity updated: {erc8004_hash}")
                except Exception as e:
                    print(f"[MantleClient] recordTrade failed: {e}")
                    nonce = self.w3.eth.get_transaction_count(account.address)

                # ── 3. updateReputation() — +1 per trade ────────────────────
                try:
                    rep_hash = self._send_tx(
                        self.identity_registry.functions.updateReputation(token_id, 1),
                        account, nonce
                    )
                    print(f"[MantleClient] Reputation updated: {rep_hash}")
                except Exception as e:
                    print(f"[MantleClient] updateReputation failed: {e}")

            return erc8004_hash or soeclaw_hash or f"0x{'0'*64}"

        except Exception as e:
            print(f"[MantleClient] Fatal error: {e}")
            return f"0x{'0' * 64}_error"

    def log_decision_on_chain(self, agent_name: str, symbol: str, action: str, confidence: float) -> str:
        """
        Records ANY agent decision (including HOLD) on SoeClaw contract only.
        Lighter than log_trade_on_chain — no reputation update for non-trade decisions.
        """
        if not self.connected or not PRIVATE_KEY:
            return f"0x{'0' * 64}_offline"
        try:
            account = self.w3.eth.account.from_key(PRIVATE_KEY)
            conf_int = int(confidence * 100)
            nonce = self.w3.eth.get_transaction_count(account.address)
            if self.contract:
                tx_hash = self._send_tx(
                    self.contract.functions.addTrade(agent_name, symbol, action, conf_int),
                    account, nonce
                )
                print(f"[MantleClient] Decision on-chain: {agent_name} {action} {symbol} -> {tx_hash}")
                return tx_hash
            return f"0x{'0'*64}"
        except Exception as e:
            print(f"[MantleClient] log_decision error: {e}")
            return f"0x{'0' * 64}_error"

    def get_agent_stats(self, agent_name: str) -> dict:
        """Returns on-chain trade count and reputation for an agent."""
        if not self.connected or not self.identity_registry:
            return {"trades": 0, "reputation": 0}
        token_id = AGENT_TOKEN_IDS.get(agent_name)
        if token_id is None:
            return {"trades": 0, "reputation": 0}
        try:
            trades = self.identity_registry.functions.getAgentTrades(token_id).call()
            reputation = self.identity_registry.functions.getAgentReputation(token_id).call()
            return {"trades": trades, "reputation": reputation}
        except Exception as e:
            print(f"[MantleClient] get_agent_stats error: {e}")
            return {"trades": 0, "reputation": 0}
