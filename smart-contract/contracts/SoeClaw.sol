// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SoeClaw {

    // ─── Existing: manual trade recording ────────────────────────────────────

    struct Trade {
        uint256 id;
        address caller;
        string agentName;
        string symbol;
        string action;
        uint256 timestamp;
        uint256 confidence;
    }

    Trade[] public trades;
    mapping(string  => uint256) public agentReputation;
    mapping(address => uint256) public userActionCount;
    address public owner;

    event TradeExecuted(
        uint256 indexed id,
        address indexed caller,
        string agentName,
        string symbol,
        string action,
        uint256 timestamp,
        uint256 confidence
    );

    event AgentTriggered(address indexed caller, string agentName, uint256 timestamp);

    // ─── AI Oracle pattern ────────────────────────────────────────────────────

    struct AIRequest {
        uint256 id;
        address caller;
        string  symbol;
        uint256 timestamp;
        bool    fulfilled;
    }

    struct AIResult {
        string  action;       // BUY / SELL / HOLD
        uint256 confidence;   // 0–100
        string  reasoning;
        uint256 fulfilledAt;
    }

    mapping(uint256 => AIRequest) public aiRequests;
    mapping(uint256 => AIResult)  public aiResults;
    uint256 public requestCount;
    address public oracle;    // backend wallet authorised to fulfil

    event AIRequested(
        uint256 indexed requestId,
        address indexed caller,
        string  symbol,
        uint256 timestamp
    );

    event AIFulfilled(
        uint256 indexed requestId,
        address indexed caller,
        string  action,
        uint256 confidence,
        string  reasoning,
        uint256 timestamp
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner  = msg.sender;
        oracle = msg.sender;   // deployer is oracle by default (backend wallet)
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner()  { require(msg.sender == owner,          "Not owner");  _; }
    modifier onlyOracle() { require(msg.sender == oracle || msg.sender == owner, "Not oracle"); _; }

    // ─── Oracle: user calls this → emits event → backend picks it up ─────────

    function requestAI(string calldata _symbol) external returns (uint256 requestId) {
        requestId = requestCount++;
        aiRequests[requestId] = AIRequest({
            id:        requestId,
            caller:    msg.sender,
            symbol:    _symbol,
            timestamp: block.timestamp,
            fulfilled: false
        });
        emit AIRequested(requestId, msg.sender, _symbol, block.timestamp);
    }

    // ─── Oracle: backend calls this after AI inference ────────────────────────

    function fulfillAIResult(
        uint256 _requestId,
        string  calldata _action,
        uint256 _confidence,
        string  calldata _reasoning
    ) external onlyOracle {
        require(_requestId < requestCount,          "Request not found");
        require(!aiRequests[_requestId].fulfilled,  "Already fulfilled");

        aiRequests[_requestId].fulfilled = true;
        aiResults[_requestId] = AIResult({
            action:      _action,
            confidence:  _confidence,
            reasoning:   _reasoning,
            fulfilledAt: block.timestamp
        });

        // also record as a trade for leaderboard
        address caller = aiRequests[_requestId].caller;
        uint256 tradeId = trades.length;
        trades.push(Trade(tradeId, caller, "SoeClawAI", _requestId < 1000 ? aiRequests[_requestId].symbol : "MULTI", _action, block.timestamp, _confidence));
        agentReputation["SoeClawAI"] += 1;
        userActionCount[caller]      += 1;

        emit AIFulfilled(_requestId, caller, _action, _confidence, _reasoning, block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getAIResult(uint256 _requestId) external view returns (
        string  memory action,
        uint256 confidence,
        string  memory reasoning,
        bool    fulfilled,
        uint256 fulfilledAt,
        address caller
    ) {
        AIResult  storage r   = aiResults[_requestId];
        AIRequest storage req = aiRequests[_requestId];
        return (r.action, r.confidence, r.reasoning, req.fulfilled, r.fulfilledAt, req.caller);
    }

    function getTradesCount()    public view returns (uint256) { return trades.length; }
    function getUserActionCount(address _user) public view returns (uint256) { return userActionCount[_user]; }

    function getTradesByUser(address _user) public view returns (uint256[] memory) {
        uint256 count = userActionCount[_user];
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < trades.length && idx < count; i++) {
            if (trades[i].caller == _user) result[idx++] = trades[i].id;
        }
        return result;
    }

    // ─── Existing manual addTrade (kept for backward compat) ─────────────────

    function addTrade(string memory _agentName, string memory _symbol, string memory _action, uint256 _confidence) public {
        uint256 tradeId = trades.length;
        trades.push(Trade(tradeId, msg.sender, _agentName, _symbol, _action, block.timestamp, _confidence));
        agentReputation[_agentName] += 1;
        userActionCount[msg.sender] += 1;
        emit TradeExecuted(tradeId, msg.sender, _agentName, _symbol, _action, block.timestamp, _confidence);
    }

    function triggerAgent(string memory _agentName) public {
        emit AgentTriggered(msg.sender, _agentName, block.timestamp);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner { oracle = _oracle; }
}
