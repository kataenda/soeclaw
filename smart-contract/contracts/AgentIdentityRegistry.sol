// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// OpenZeppelin v4.9.x compatible

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentIdentityRegistry
 * @notice ERC-8004 compliant Identity Registry for SoeClaw AI Agents.
 *         Each AI agent is issued a unique ERC-721 NFT identity with an
 *         on-chain record of capabilities, reputation, and on-chain activity.
 * @dev Implements the Identity Registry component of ERC-8004 (Trustless Agents).
 *      Spec: https://eips.ethereum.org/EIPS/eip-8004
 */
contract AgentIdentityRegistry is ERC721URIStorage, Ownable {

    uint256 private _nextTokenId;

    struct MetadataEntry {
        string metadataKey;
        bytes  metadataValue;
    }

    // agentId => metadataKey => metadataValue
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // agentId => verified payment wallet
    mapping(uint256 => address) private _agentWallets;

    // agentId => total on-chain trades executed
    mapping(uint256 => uint256) private _agentTrades;

    // agentId => cumulative reputation score
    mapping(uint256 => int256) private _agentReputation;

    // ── ERC-8004 Events ──────────────────────────────────────────────────────
    event Registered(
        uint256 indexed agentId,
        string  agentURI,
        address indexed owner
    );

    event URIUpdated(
        uint256 indexed agentId,
        string  newURI,
        address indexed updatedBy
    );

    event MetadataSet(
        uint256 indexed agentId,
        string  indexed indexedMetadataKey,
        string  metadataKey,
        bytes   metadataValue
    );

    event TradeRecorded(
        uint256 indexed agentId,
        string  agentName,
        string  symbol,
        string  action,
        uint256 confidence,
        uint256 timestamp
    );

    event ReputationUpdated(
        uint256 indexed agentId,
        int256  newScore
    );

    // ────────────────────────────────────────────────────────────────────────
    constructor()
        ERC721("SoeClaw Agent Identity", "SCAI")
    {}

    // ── ERC-8004 Core: Registration ──────────────────────────────────────────

    /**
     * @notice Register a new agent with a URI pointing to its agent card JSON.
     * @param agentURI URI of the ERC-8004 agent registration file (IPFS/HTTPS).
     * @return agentId The ERC-721 token ID assigned to this agent.
     */
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        if (bytes(agentURI).length > 0) {
            _setTokenURI(agentId, agentURI);
        }
        emit Registered(agentId, agentURI, msg.sender);
    }

    /**
     * @notice Register a new agent without a URI (URI can be set later).
     */
    function register() external returns (uint256 agentId) {
        agentId = _nextTokenId++;
        _safeMint(msg.sender, agentId);
        emit Registered(agentId, "", msg.sender);
    }

    // ── ERC-8004 Core: URI Management ────────────────────────────────────────

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    // ── ERC-8004 Core: Metadata ──────────────────────────────────────────────

    function setMetadata(
        uint256 agentId,
        string  memory metadataKey,
        bytes   memory metadataValue
    ) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function getMetadata(uint256 agentId, string memory metadataKey)
        external view returns (bytes memory)
    {
        return _metadata[agentId][metadataKey];
    }

    function batchSetMetadata(uint256 agentId, MetadataEntry[] calldata entries) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        for (uint256 i = 0; i < entries.length; i++) {
            _metadata[agentId][entries[i].metadataKey] = entries[i].metadataValue;
            emit MetadataSet(agentId, entries[i].metadataKey, entries[i].metadataKey, entries[i].metadataValue);
        }
    }

    // ── ERC-8004 Core: Wallet ────────────────────────────────────────────────

    function setAgentWallet(uint256 agentId, address newWallet) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        _agentWallets[agentId] = newWallet;
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _agentWallets[agentId];
    }

    function unsetAgentWallet(uint256 agentId) external {
        require(ownerOf(agentId) == msg.sender, "Not agent owner");
        delete _agentWallets[agentId];
    }

    // ── SoeClaw Extension: On-Chain Benchmarking ────────────────────────────

    /**
     * @notice Record a trade execution by an agent — builds its on-chain benchmark.
     * @dev Can only be called by the owner (backend) to prevent manipulation.
     */
    function recordTrade(
        uint256 agentId,
        string  calldata agentName,
        string  calldata symbol,
        string  calldata action,
        uint256 confidence
    ) external onlyOwner {
        _agentTrades[agentId]++;
        emit TradeRecorded(agentId, agentName, symbol, action, confidence, block.timestamp);
    }

    /**
     * @notice Update an agent's reputation score (positive = good performance).
     */
    function updateReputation(uint256 agentId, int256 delta) external onlyOwner {
        _agentReputation[agentId] += delta;
        emit ReputationUpdated(agentId, _agentReputation[agentId]);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    function totalAgents() external view returns (uint256) {
        return _nextTokenId;
    }

    function getAgentTrades(uint256 agentId) external view returns (uint256) {
        return _agentTrades[agentId];
    }

    function getAgentReputation(uint256 agentId) external view returns (int256) {
        return _agentReputation[agentId];
    }

    /**
     * @notice Returns full identity info for an agent in one call.
     */
    function getAgentIdentity(uint256 agentId) external view returns (
        address owner,
        string  memory agentURI,
        address wallet,
        uint256 totalTrades,
        int256  reputation
    ) {
        owner       = ownerOf(agentId);
        agentURI    = tokenURI(agentId);
        wallet      = _agentWallets[agentId];
        totalTrades = _agentTrades[agentId];
        reputation  = _agentReputation[agentId];
    }
}
