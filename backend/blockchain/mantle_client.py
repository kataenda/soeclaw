import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

_NETWORK = os.getenv("MANTLE_NETWORK", "sepolia")
RPC_URL = "https://rpc.mantle.xyz" if _NETWORK == "mainnet" else "https://rpc.sepolia.mantle.xyz"
CHAIN_ID = 5000 if _NETWORK == "mainnet" else 5003
EXPLORER_BASE = "https://explorer.mantle.xyz" if _NETWORK == "mainnet" else "https://sepolia.mantlescan.xyz"

CONTRACT_ADDRESS = os.getenv("MANTLE_CONTRACT_ADDRESS", "0x95877513429566993C96544B639c87E7c6965a3C")
IDENTITY_REGISTRY_ADDRESS = os.getenv(
    "IDENTITY_REGISTRY_ADDRESS",
    "0xAFc049fD17dEF8D9bDC0ed234675D90D4e3f607d"
)
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")

# Agent name → ERC-8004 token ID on AgentIdentityRegistry
AGENT_TOKEN_IDS = {
    "AlphaQuant":    0,
    "WhaleWatcher":  1,
    "MacroAnalyzer": 2,
    "RiskManager":   3,
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
        "inputs": [{"internalType": "string", "name": "_agentName", "type": "string"}],
        "name": "triggerAgent",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "string", "name": "_symbol", "type": "string"}],
        "name": "requestAI",
        "outputs": [{"internalType": "uint256", "name": "requestId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "_requestId", "type": "uint256"},
            {"internalType": "string",  "name": "_action",    "type": "string"},
            {"internalType": "uint256", "name": "_confidence","type": "uint256"},
            {"internalType": "string",  "name": "_reasoning", "type": "string"}
        ],
        "name": "fulfillAIResult",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "_requestId", "type": "uint256"}],
        "name": "getAIResult",
        "outputs": [
            {"internalType": "string",  "name": "action",      "type": "string"},
            {"internalType": "uint256", "name": "confidence",   "type": "uint256"},
            {"internalType": "string",  "name": "reasoning",    "type": "string"},
            {"internalType": "bool",    "name": "fulfilled",    "type": "bool"},
            {"internalType": "uint256", "name": "fulfilledAt",  "type": "uint256"},
            {"internalType": "address", "name": "caller",       "type": "address"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "internalType": "uint256", "name": "requestId", "type": "uint256"},
            {"indexed": True,  "internalType": "address", "name": "caller",    "type": "address"},
            {"indexed": False, "internalType": "string",  "name": "symbol",    "type": "string"},
            {"indexed": False, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
        ],
        "name": "AIRequested",
        "type": "event"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "internalType": "uint256", "name": "requestId", "type": "uint256"},
            {"indexed": True,  "internalType": "address", "name": "caller",    "type": "address"},
            {"indexed": False, "internalType": "string",  "name": "action",    "type": "string"},
            {"indexed": False, "internalType": "uint256", "name": "confidence","type": "uint256"},
            {"indexed": False, "internalType": "string",  "name": "reasoning", "type": "string"},
            {"indexed": False, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
        ],
        "name": "AIFulfilled",
        "type": "event"
    },
    {
        "inputs": [{"internalType": "address", "name": "_user", "type": "address"}],
        "name": "getUserActionCount",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
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
            "chainId": CHAIN_ID,
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

    def log_trade_on_chain(self, agent_name: str, symbol: str, action: str, confidence: float):
        """
        Records trade on SoeClaw contract AND updates ERC-8004 AgentIdentityRegistry.
        Returns the ERC-8004 tx hash (the canonical on-chain identity record), or None if offline/failed.
        """
        if not self.connected or not PRIVATE_KEY:
            print(f"[MantleClient] Offline — skipping on-chain log for {agent_name}")
            return None

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

            return erc8004_hash or soeclaw_hash or None

        except Exception as e:
            print(f"[MantleClient] Fatal error: {e}")
            return None

    def log_decision_on_chain(self, agent_name: str, symbol: str, action: str, confidence: float):
        """
        Records ANY agent decision (including HOLD) on SoeClaw contract only.
        Lighter than log_trade_on_chain — no reputation update for non-trade decisions.
        Returns tx hash string or None if offline/failed.
        """
        if not self.connected or not PRIVATE_KEY:
            print(f"[MantleClient] Offline — skipping decision log for {agent_name}")
            return None
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
            return None
        except Exception as e:
            print(f"[MantleClient] log_decision error: {e}")
            return None

    def fulfill_ai_request(self, request_id: int, action: str, confidence: int, reasoning: str):
        """Backend oracle: calls fulfillAIResult() after AI inference. Returns tx hash or None."""
        if not self.connected or not PRIVATE_KEY or not self.contract:
            return None
        try:
            account = self.w3.eth.account.from_key(PRIVATE_KEY)
            nonce   = self.w3.eth.get_transaction_count(account.address)
            tx_hash = self._send_tx(
                self.contract.functions.fulfillAIResult(request_id, action, confidence, reasoning),
                account, nonce
            )
            print(f"[Oracle] fulfillAIResult({request_id}) → {tx_hash}")
            return tx_hash
        except Exception as e:
            print(f"[Oracle] fulfillAIResult error: {e}")
            return None

    def get_pending_ai_requests(self, from_block: int = 0) -> list:
        """Scan for AIRequested events that have not been fulfilled yet."""
        if not self.connected or not self.contract:
            return []
        try:
            event = self.contract.events.AIRequested
            logs  = event.get_logs(from_block=from_block)
            pending = []
            for log in logs:
                rid = log["args"]["requestId"]
                try:
                    result = self.contract.functions.getAIResult(rid).call()
                    fulfilled = result[3]
                except Exception:
                    fulfilled = False
                if not fulfilled:
                    pending.append({
                        "request_id": rid,
                        "caller":     log["args"]["caller"],
                        "symbol":     log["args"]["symbol"],
                        "block":      log["blockNumber"],
                    })
            return pending
        except Exception as e:
            print(f"[Oracle] get_pending_ai_requests error: {e}")
            return []

    def deploy_contract(self, abi: list, bytecode: str) -> dict:
        """Deploy a compiled contract to Mantle. Returns {address, tx_hash, deployer}."""
        if not PRIVATE_KEY:
            raise RuntimeError("PRIVATE_KEY not set — cannot deploy")
        if not self.connected:
            raise RuntimeError("Not connected to Mantle RPC")
        account = self.w3.eth.account.from_key(PRIVATE_KEY)
        nonce = self.w3.eth.get_transaction_count(account.address)
        Contract = self.w3.eth.contract(abi=abi, bytecode=bytecode)
        deploy_tx = Contract.constructor().build_transaction({
            "chainId": CHAIN_ID,
            "gas": 3_000_000,
            "maxFeePerGas": self.w3.eth.gas_price,
            "maxPriorityFeePerGas": self.w3.to_wei("1", "gwei"),
            "nonce": nonce,
            "from": account.address,
        })
        signed = self.w3.eth.account.sign_transaction(deploy_tx, private_key=PRIVATE_KEY)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        tx_hash = self.w3.eth.send_raw_transaction(raw)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return {
            "address": receipt.contractAddress,
            "tx_hash": receipt.transactionHash.hex(),
            "deployer": account.address,
        }

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
